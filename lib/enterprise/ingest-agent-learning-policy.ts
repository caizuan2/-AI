import type {
  IngestAgentLearningInstruction,
  IngestAgentLearningState
} from "@/lib/enterprise/ingest-memory-types";

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function buildAgentLearningInstruction(input: {
  agentId?: string;
  learningState?: IngestAgentLearningState | null;
  userInstruction: string;
  memoryContext?: string;
}): IngestAgentLearningInstruction {
  const warnings: string[] = [];

  if (!input.learningState) {
    return {
      instructionText: "",
      appliedPolicies: [],
      warnings: ["NO_AGENT_LEARNING_STATE"]
    };
  }

  const policies = unique([
    input.learningState.preferredAnswerStyle || "保持自然、结论优先、短段落的 ChatGPT 式表达。",
    input.learningState.learnedTopics.length ? `优先贴合已学习主题：${input.learningState.learnedTopics.slice(0, 6).join("、")}。` : "",
    input.learningState.riskBoundaries?.length ? `涉及风险时提醒边界：${input.learningState.riskBoundaries.slice(0, 4).join("、")}。` : "",
    input.learningState.recentCorrections?.length ? `参考最近修正：${input.learningState.recentCorrections.slice(0, 4).join("、")}。` : ""
  ]);

  if (!input.memoryContext?.trim()) {
    warnings.push("NO_MEMORY_CONTEXT_FOR_POLICY");
  }

  const instructionText = policies.length
    ? [
      "【本Agent已学习的回答偏好】",
      "",
      ...policies.map((policy) => `* ${policy}`),
      "",
      "这些偏好只能辅助本轮回答，不得覆盖用户当前指令。"
    ].join("\n")
    : "";

  return {
    instructionText,
    appliedPolicies: policies,
    warnings
  };
}
