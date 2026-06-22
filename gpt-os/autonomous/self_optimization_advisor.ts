export type SelfOptimizationSuggestionType =
  "knowledge_patch" |
  "rag_chunk_review" |
  "prompt_template_review" |
  "provider_stability_review";

export type SelfOptimizationRiskLevel = "low" | "medium" | "high";

export interface SelfOptimizationAdvisorInput {
  systemHealthScore: number;
  relevanceScore: number;
  fallbackRate: number;
  riskAreas?: string[];
}

export interface SelfOptimizationSuggestion {
  suggestion_type: SelfOptimizationSuggestionType;
  expected_improvement: string;
  risk_level: SelfOptimizationRiskLevel;
  patch: Record<string, unknown>;
  reason: string;
  requires_approval: true;
}

export function adviseSelfOptimization(input: SelfOptimizationAdvisorInput): SelfOptimizationSuggestion[] {
  const suggestions: SelfOptimizationSuggestion[] = [];
  const riskAreas = input.riskAreas ?? [];

  if (input.relevanceScore < 0.3 || riskAreas.includes("missing_knowledge")) {
    suggestions.push({
      suggestion_type: "knowledge_patch",
      expected_improvement: "提高缺失知识问题的命中率和回答 grounding。",
      risk_level: "medium",
      patch: {
        type: "knowledge_patch_proposal",
        action: "prepare_patch",
      },
      reason: "低相关度或缺失知识需要人工确认后补充投喂内容。",
      requires_approval: true,
    });
  }

  if (riskAreas.includes("low_rag_quality")) {
    suggestions.push({
      suggestion_type: "rag_chunk_review",
      expected_improvement: "改善低质量切片的召回质量。",
      risk_level: "medium",
      patch: {
        type: "rag_chunk_review_proposal",
        action: "review_chunk_metadata",
      },
      reason: "RAG 质量偏低，建议人工复查切片标题、摘要和关键词。",
      requires_approval: true,
    });
  }

  if (input.fallbackRate > 0.2) {
    suggestions.push({
      suggestion_type: "provider_stability_review",
      expected_improvement: "降低 fallback 对回答质量的影响。",
      risk_level: "low",
      patch: {
        type: "provider_stability_review",
        action: "inspect_provider_status",
      },
      reason: "fallback rate 偏高，需要人工检查供应商状态和配置。",
      requires_approval: true,
    });
  }

  if (input.systemHealthScore < 30) {
    suggestions.push({
      suggestion_type: "prompt_template_review",
      expected_improvement: "提升低健康状态下回答结构和知识约束。",
      risk_level: "high",
      patch: {
        type: "prompt_template_review",
        action: "draft_template_for_review",
      },
      reason: "系统健康分过低，只允许生成建议和人工审核补丁。",
      requires_approval: true,
    });
  }

  return suggestions;
}
