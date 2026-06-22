export type KnowledgePatchIssue = "missing_knowledge";
export type RepairPriority = "low" | "medium" | "high";

export interface KnowledgePatchGeneratorInput {
  sourceQuestion: string;
  suggestedKnowledge?: string;
  priority?: RepairPriority;
}

export interface KnowledgePatch {
  type: "knowledge_patch";
  issue: KnowledgePatchIssue;
  source_question: string;
  suggested_knowledge: string;
  embedding_ready: true;
  priority: RepairPriority;
}

export function generateKnowledgePatch(input: KnowledgePatchGeneratorInput): KnowledgePatch | null {
  const sourceQuestion = input.sourceQuestion.trim();

  if (!sourceQuestion) {
    return null;
  }

  return {
    type: "knowledge_patch",
    issue: "missing_knowledge",
    source_question: sourceQuestion,
    suggested_knowledge: normalizeSuggestedKnowledge(sourceQuestion, input.suggestedKnowledge),
    embedding_ready: true,
    priority: input.priority ?? "medium",
  };
}

function normalizeSuggestedKnowledge(sourceQuestion: string, suggestedKnowledge?: string): string {
  const normalized = suggestedKnowledge?.trim();

  if (normalized) {
    return normalized;
  }

  return [
    `建议补充与「${sourceQuestion}」直接相关的标准知识。`,
    "内容应包含适用场景、处理步骤、注意事项和可直接复用的回答示例。",
  ].join("\n");
}
