export type RagRepairAction = "improve_rag_chunk";
export type UserNegativeFeedback = "dislike" | "unsatisfied" | "negative";

export interface RagSelfOptimizerInput {
  query: string;
  oldChunk?: string;
  relevanceScore: number;
  hitCount: number;
  userFeedback?: UserNegativeFeedback;
}

export interface RagChunkRepairSuggestion {
  action: RagRepairAction;
  old_chunk: string;
  improved_chunk: string;
  reason: string;
}

export function optimizeRagChunk(input: RagSelfOptimizerInput): RagChunkRepairSuggestion | null {
  const shouldRepair = input.relevanceScore < 0.3 || input.hitCount === 0 || isNegativeFeedback(input.userFeedback);

  if (!shouldRepair) {
    return null;
  }

  const query = input.query.trim();
  const oldChunk = input.oldChunk?.trim() || "";

  return {
    action: "improve_rag_chunk",
    old_chunk: oldChunk,
    improved_chunk: buildImprovedChunk(query, oldChunk),
    reason: buildReason(input),
  };
}

function isNegativeFeedback(feedback?: UserNegativeFeedback): boolean {
  return feedback === "dislike" || feedback === "unsatisfied" || feedback === "negative";
}

function buildImprovedChunk(query: string, oldChunk: string): string {
  if (!oldChunk) {
    return `围绕「${query}」补充新的知识切片，覆盖问题背景、处理步骤、风险点和示例回答。`;
  }

  return [
    oldChunk,
    "",
    `补充优化：明确回答「${query}」相关场景，增加步骤、边界条件和可复用话术。`,
  ].join("\n");
}

function buildReason(input: RagSelfOptimizerInput): string {
  if (input.hitCount === 0) {
    return "当前问题没有命中知识切片，需要补充可检索内容。";
  }

  if (input.relevanceScore < 0.3) {
    return "命中相关度低于 0.3，建议优化切片表达和关键词覆盖。";
  }

  return "用户反馈为负向，建议人工复查命中切片质量。";
}
