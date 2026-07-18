import type {
  IngestMemoryConflictLevel,
  IngestMemoryConflictResult,
  IngestMemoryItem
} from "@/lib/enterprise/ingest-memory-types";
import { scoreTextSimilarity } from "@/lib/enterprise/ingest-memory-vectorizer";

const NEGATIVE_CUES = ["不要", "不能", "禁止", "避免", "不允许", "不建议", "风险", "合规"];
const POSITIVE_CUES = ["必须", "可以", "建议", "优先", "应该", "允许", "推荐"];

function hasAny(text: string, cues: string[]) {
  return cues.some((cue) => text.includes(cue));
}

function directionConflict(left: string, right: string) {
  return (hasAny(left, NEGATIVE_CUES) && hasAny(right, POSITIVE_CUES))
    || (hasAny(left, POSITIVE_CUES) && hasAny(right, NEGATIVE_CUES));
}

function readSteps(text: string) {
  return text
    .split(/(?:\n|。|；|;)/)
    .map((line) => line.replace(/^\s*\d+[.、]\s*/, "").trim())
    .filter((line) => line.length > 4)
    .slice(0, 8);
}

function stepOrderConflict(left: string, right: string) {
  const leftSteps = readSteps(left);
  const rightSteps = readSteps(right);

  if (leftSteps.length < 2 || rightSteps.length < 2) {
    return false;
  }

  const firstLeft = leftSteps[0];
  const lastLeft = leftSteps[leftSteps.length - 1];
  const firstRightIndex = rightSteps.findIndex((step) => scoreTextSimilarity(firstLeft, {
    id: "tmp",
    type: "sop",
    title: step,
    content: step,
    confidence: 1,
    status: "draft",
    createdAt: Date.now()
  }) > 0.32);
  const lastRightIndex = rightSteps.findIndex((step) => scoreTextSimilarity(lastLeft, {
    id: "tmp",
    type: "sop",
    title: step,
    content: step,
    confidence: 1,
    status: "draft",
    createdAt: Date.now()
  }) > 0.32);

  return firstRightIndex >= 0 && lastRightIndex >= 0 && firstRightIndex > lastRightIndex;
}

function maxConflictLevel(levels: IngestMemoryConflictLevel[]) {
  const weight: Record<IngestMemoryConflictLevel, number> = {
    none: 0,
    low: 1,
    medium: 2,
    high: 3
  };

  return levels.sort((left, right) => weight[right] - weight[left])[0] ?? "none";
}

export function detectMemoryConflicts(input: {
  newMemory: IngestMemoryItem;
  existingMemories: IngestMemoryItem[];
}): IngestMemoryConflictResult {
  const conflicts: IngestMemoryConflictResult["conflicts"] = [];
  const levels: IngestMemoryConflictLevel[] = [];

  for (const existing of input.existingMemories) {
    if (existing.id === input.newMemory.id || existing.status === "rejected") {
      continue;
    }

    const titleSimilarity = scoreTextSimilarity(input.newMemory.title, existing);
    const contentSimilarity = scoreTextSimilarity(input.newMemory.content, existing);
    const sameQuestion = input.newMemory.type === "faq" && existing.type === "faq" && titleSimilarity > 0.45;

    if ((titleSimilarity > 0.5 || contentSimilarity > 0.4) && directionConflict(input.newMemory.content, existing.content)) {
      conflicts.push({
        memoryId: existing.id,
        reason: "标题或内容相似，但一个偏允许/建议，另一个偏禁止/避免。",
        field: "content",
        suggestion: "不要自动合并，请人工确认风险边界。"
      });
      levels.push("high");
      continue;
    }

    if (sameQuestion && contentSimilarity < 0.25) {
      conflicts.push({
        memoryId: existing.id,
        reason: "同一 FAQ 主题存在不同答案。",
        field: "faq.answer",
        suggestion: "建议保留最新答案并人工确认旧答案是否过期。"
      });
      levels.push("medium");
      continue;
    }

    if (input.newMemory.type === "risk" && existing.type === "risk" && titleSimilarity > 0.42 && directionConflict(input.newMemory.content, existing.content)) {
      conflicts.push({
        memoryId: existing.id,
        reason: "风险边界方向不一致。",
        field: "risk_boundary",
        suggestion: "建议以更严格的合规边界为准。"
      });
      levels.push("high");
      continue;
    }

    if (input.newMemory.type === "sop" && existing.type === "sop" && titleSimilarity > 0.35 && stepOrderConflict(input.newMemory.content, existing.content)) {
      conflicts.push({
        memoryId: existing.id,
        reason: "SOP 步骤顺序疑似冲突。",
        field: "sop.steps",
        suggestion: "请人工选择当前执行顺序。"
      });
      levels.push("medium");
      continue;
    }

    if (input.newMemory.type === "agent_preference" && existing.type === "agent_preference" && directionConflict(input.newMemory.content, existing.content)) {
      conflicts.push({
        memoryId: existing.id,
        reason: "Agent 偏好有相反要求。",
        field: "agent_preference",
        suggestion: "优先以用户最近一次明确修正为准。"
      });
      levels.push("medium");
    }
  }

  const conflictLevel = maxConflictLevel(levels);

  return {
    hasConflict: conflicts.length > 0,
    conflictLevel,
    conflicts
  };
}
