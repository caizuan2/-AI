import type { IngestDraftMergePlan, IngestMemoryItem } from "@/lib/enterprise/ingest-memory-types";

function tokenize(value: string) {
  return Array.from(new Set(value
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
  ));
}

function overlapScore(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const rightSet = new Set(right);
  const overlap = left.filter((token) => rightSet.has(token)).length;

  return overlap / Math.max(left.length, right.length);
}

export function memorySimilarity(left: IngestMemoryItem, right: IngestMemoryItem) {
  const titleScore = overlapScore(tokenize(left.title), tokenize(right.title));
  const contentScore = overlapScore(tokenize(left.content), tokenize(right.content));
  const tagScore = overlapScore(left.tags ?? [], right.tags ?? []);
  const typeScore = left.type === right.type ? 0.22 : 0;
  const scopeScore = left.agentId && right.agentId && left.agentId === right.agentId ? 0.12 : 0;

  return Math.min(1, titleScore * 0.28 + contentScore * 0.3 + tagScore * 0.18 + typeScore + scopeScore);
}

export function findSimilarMemoryDrafts(input: {
  candidate: IngestMemoryItem;
  drafts: IngestMemoryItem[];
  minScore?: number;
}) {
  const minScore = input.minScore ?? 0.42;

  return input.drafts
    .filter((draft) => draft.id !== input.candidate.id)
    .map((draft) => ({
      draft,
      score: memorySimilarity(input.candidate, draft)
    }))
    .filter((item) => item.score >= minScore)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);
}

export function createMemoryMergePlan(input: {
  items: IngestMemoryItem[];
}): IngestDraftMergePlan {
  const sourceIds = input.items.map((item) => item.id);
  const tags = Array.from(new Set(input.items.flatMap((item) => item.tags ?? []))).slice(0, 8);
  const categories = input.items.map((item) => item.category).filter(Boolean) as string[];
  const content = input.items
    .map((item, index) => `${index + 1}. ${item.content}`)
    .join("\n");
  const averageSimilarity = input.items.length <= 1
    ? 0
    : input.items.reduce((total, item, index) => {
      const next = input.items[index + 1];

      return next ? total + memorySimilarity(item, next) : total;
    }, 0) / Math.max(1, input.items.length - 1);
  const duplicateRisk = averageSimilarity >= 0.64 ? "high" : averageSimilarity >= 0.42 ? "medium" : "low";
  const first = input.items[0];

  return {
    ok: input.items.length > 0,
    sourceIds,
    mergedTitle: first ? `${first.title}（合并建议）` : "训练记忆合并建议",
    mergedContent: content,
    mergedSummary: first ? `建议将 ${input.items.length} 条相似训练记忆合并为一条可确认草稿。` : "暂无可合并草稿。",
    duplicateRisk,
    reason: duplicateRisk === "high"
      ? "标题、标签和内容高度相似，可能与已有草稿重复，建议合并后入库。"
      : duplicateRisk === "medium"
        ? "存在主题重叠，可由管理员确认是否合并。"
        : "重复风险较低，可作为独立草稿保留。",
    tags,
    category: categories[0]
  };
}
