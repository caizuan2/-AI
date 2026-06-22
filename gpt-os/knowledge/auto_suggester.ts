import type { KnowledgeGapEvent, KnowledgeGapSeverity } from "./gap_detector";

export type AutoSuggestionType = "add_knowledge" | "improve_chunk" | "rewrite_prompt";

export interface AutoSuggestionContext {
  ragQualityScore: number;
  fallbackUsed: boolean;
  answerQuality: "high" | "medium" | "low";
}

export interface AutoImprovementSuggestion {
  suggestion_type: AutoSuggestionType;
  content: string;
  priority: number;
}

export function suggestKnowledgeImprovements(
  gapEvent: KnowledgeGapEvent | null,
  context: AutoSuggestionContext,
): AutoImprovementSuggestion[] {
  if (gapEvent) {
    return [
      {
        suggestion_type: "add_knowledge",
        content: `建议补充与「${gapEvent.query}」直接相关的投喂知识，并覆盖用户可能使用的同义问法。`,
        priority: priorityFromSeverity(gapEvent.severity),
      },
    ];
  }

  if (context.fallbackUsed) {
    return [
      {
        suggestion_type: "rewrite_prompt",
        content: "本次回答发生模型兜底，建议复查模型可用性和提示词约束，避免回答脱离知识库。",
        priority: 70,
      },
    ];
  }

  if (context.ragQualityScore < 0.45 || context.answerQuality === "low") {
    return [
      {
        suggestion_type: "improve_chunk",
        content: "本次 RAG 质量偏低，建议复查命中片段是否过短、过旧或缺少关键上下文。",
        priority: 55,
      },
    ];
  }

  return [];
}

function priorityFromSeverity(severity: KnowledgeGapSeverity): number {
  if (severity === "high") {
    return 90;
  }

  if (severity === "medium") {
    return 70;
  }

  return 45;
}
