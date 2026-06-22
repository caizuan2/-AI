export type EvolutionAnswerQuality = "high" | "medium" | "low";

export interface EvolutionEngineInput {
  ragQualityScore: number;
  relevanceScore: number;
  hitCount: number;
  topK: number;
  fallbackUsed: boolean;
  answerQuality: EvolutionAnswerQuality;
  repeatedQueryCount?: number;
}

export interface EvolutionEngineResult {
  system_health_score: number;
  rag_quality_score: number;
  model_efficiency_score: number;
  fallback_rate: number;
  knowledge_coverage_score: number;
  improvement_actions: string[];
  risk_areas: string[];
}

export interface EvolutionRepairExecutionPlan {
  auto_execute: false;
  manual_approve_required: true;
  detect: boolean;
  propose: boolean;
  approve: "manual_only";
  execute: false;
}

export function evaluateEvolutionHealth(input: EvolutionEngineInput): EvolutionEngineResult {
  const ragQualityScore = clampScore(input.ragQualityScore * 100);
  const knowledgeCoverageScore = clampScore(input.topK > 0 ? (input.hitCount / input.topK) * 100 : 0);
  const modelEfficiencyScore = calculateModelEfficiency(input.fallbackUsed, input.answerQuality);
  const fallbackRate = input.fallbackUsed ? 1 : 0;
  const stableModelScore = 100 - fallbackRate * 100;
  const systemHealthScore = clampScore(
    ragQualityScore * 0.4 +
      knowledgeCoverageScore * 0.25 +
      modelEfficiencyScore * 0.25 +
      stableModelScore * 0.1,
  );

  return {
    system_health_score: systemHealthScore,
    rag_quality_score: ragQualityScore,
    model_efficiency_score: modelEfficiencyScore,
    fallback_rate: fallbackRate,
    knowledge_coverage_score: knowledgeCoverageScore,
    improvement_actions: buildImprovementActions(input, ragQualityScore, knowledgeCoverageScore),
    risk_areas: buildRiskAreas(input, ragQualityScore, knowledgeCoverageScore),
  };
}

export function createEvolutionRepairExecutionPlan(input: EvolutionEngineResult): EvolutionRepairExecutionPlan {
  return {
    auto_execute: false,
    manual_approve_required: true,
    detect: input.risk_areas.length > 0,
    propose: input.improvement_actions.length > 0,
    approve: "manual_only",
    execute: false,
  };
}

function calculateModelEfficiency(fallbackUsed: boolean, answerQuality: EvolutionAnswerQuality): number {
  if (fallbackUsed) {
    return 55;
  }

  if (answerQuality === "high") {
    return 92;
  }

  if (answerQuality === "medium") {
    return 75;
  }

  return 45;
}

function buildImprovementActions(
  input: EvolutionEngineInput,
  ragQualityScore: number,
  knowledgeCoverageScore: number,
): string[] {
  const actions: string[] = [];

  if (input.hitCount === 0 || input.relevanceScore < 0.3) {
    actions.push("建议补充缺失知识条目，优先覆盖本次用户问题。");
  }

  if (knowledgeCoverageScore < 40) {
    actions.push("建议复查知识切片覆盖率，增加关键场景和同义表达。");
  }

  if (ragQualityScore < 50) {
    actions.push("建议检查命中片段质量和回答 grounding 约束。");
  }

  if (input.fallbackUsed) {
    actions.push("建议检查模型供应商状态，避免 fallback 影响回答质量。");
  }

  if ((input.repeatedQueryCount ?? 0) >= 3) {
    actions.push("建议将重复失败问题整理为投喂端待补充任务。");
  }

  return actions;
}

function buildRiskAreas(
  input: EvolutionEngineInput,
  ragQualityScore: number,
  knowledgeCoverageScore: number,
): string[] {
  const risks: string[] = [];

  if (input.hitCount === 0) {
    risks.push("missing_knowledge");
  }

  if (knowledgeCoverageScore < 40) {
    risks.push("low_knowledge_coverage");
  }

  if (ragQualityScore < 50) {
    risks.push("low_rag_quality");
  }

  if (input.fallbackUsed) {
    risks.push("model_fallback");
  }

  return risks;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
