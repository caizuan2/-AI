import type { KnowledgeLoopCandidate } from "@/lib/enterprise/knowledge-loop-engine";

export type KnowledgeQualityLevel = "high" | "medium" | "low";
export type KnowledgeIntelligenceAction = "promote" | "review" | "merge" | "improve" | "reject";

export interface KnowledgeQualityScore {
  overallScore: number;
  clarityScore: number;
  usefulnessScore: number;
  reusabilityScore: number;
  retrievalReadinessScore: number;
  commercialValueScore: number;
  riskScore: number;
  confidenceScore: number;
}

export interface KnowledgeQualityResult extends KnowledgeQualityScore {
  qualityLevel: KnowledgeQualityLevel;
  action: KnowledgeIntelligenceAction;
  reasons: string[];
  suggestions: string[];
}

export interface KnowledgeIntelligenceReport {
  overallScore: number;
  qualityLevel: KnowledgeQualityLevel;
  highValueCount: number;
  reviewRequiredCount: number;
  lowQualityCount: number;
  improvementSuggestions: string[];
  mergeSuggestions: string[];
  riskWarnings: string[];
  candidates: Array<{
    candidateId: string;
    title: string;
    qualityScore: number;
    qualityLevel: KnowledgeQualityLevel;
    action: KnowledgeIntelligenceAction;
    reasons: string[];
    suggestions: string[];
  }>;
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function uniqueStrings(values: string[], limit = 12) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const clean = cleanText(value);

    if (!clean || seen.has(clean)) {
      continue;
    }

    seen.add(clean);
    result.push(clean);
  }

  return result.slice(0, limit);
}

function scoreFromCandidateBase(unit: KnowledgeLoopCandidate, key: "clarity" | "usefulness" | "reusability" | "confidence") {
  return clampScore((unit.score?.[key] ?? 0) * 100);
}

function hasRiskLanguage(text: string) {
  return /包治|根治|百分百|绝对|保证有效|无副作用|治疗|诊断|禁忌|孕妇|儿童|药|医疗|违法|违规|承诺/.test(text);
}

function hasCommercialLanguage(text: string) {
  return /客户|成交|转化|咨询|话术|报价|价格|复购|销售|培训|售前|售后/.test(text);
}

function hasRetrievalReadySignals(unit: KnowledgeLoopCandidate, text: string) {
  return Boolean(
    unit.standardQuestion
    || unit.suggestedQuestions.length
    || unit.retrievalHints.length
    || /怎么|如何|为什么|流程|步骤|标准|场景|客户/.test(text)
  );
}

function qualityLevel(score: number, riskScore: number): KnowledgeQualityLevel {
  if (riskScore >= 70 || score < 55) {
    return "low";
  }

  if (score >= 78) {
    return "high";
  }

  return "medium";
}

function actionForQuality(input: {
  score: number;
  level: KnowledgeQualityLevel;
  riskScore: number;
  duplicateRisk?: "low" | "medium" | "high";
}): KnowledgeIntelligenceAction {
  if (input.duplicateRisk === "high") {
    return "merge";
  }

  if (input.riskScore >= 70) {
    return "review";
  }

  if (input.level === "high") {
    return "promote";
  }

  if (input.level === "medium") {
    return "improve";
  }

  return input.score < 40 ? "reject" : "review";
}

export class KnowledgeIntelligenceEngine {
  evaluateKnowledgeQuality(input: KnowledgeLoopCandidate | string, context: { duplicateRisk?: "low" | "medium" | "high" } = {}): KnowledgeQualityResult {
    const unit = typeof input === "string" ? null : input;
    const text = cleanText(typeof input === "string" ? input : `${input.title}\n${input.content}\n${input.standardQuestion ?? ""}\n${input.standardAnswer ?? ""}`);
    const length = text.length;
    const riskScore = this.scoreRisk(text);
    const clarityScore = unit ? scoreFromCandidateBase(unit, "clarity") : clampScore(length > 40 ? 72 : 48);
    const usefulnessScore = unit ? scoreFromCandidateBase(unit, "usefulness") : clampScore(/建议|步骤|回复|处理|方案/.test(text) ? 78 : 58);
    const reusabilityScore = unit ? scoreFromCandidateBase(unit, "reusability") : clampScore(/标准|流程|话术|FAQ|SOP|客户|场景/.test(text) ? 78 : 55);
    const retrievalReadinessScore = clampScore((unit && hasRetrievalReadySignals(unit, text) ? 82 : 58) + (length > 80 ? 6 : -4));
    const commercialValueScore = clampScore(hasCommercialLanguage(text) ? 82 : /培训|制度|流程|产品/.test(text) ? 68 : 52);
    const confidenceScore = unit ? scoreFromCandidateBase(unit, "confidence") : clampScore(/可能|大概|不确定/.test(text) ? 52 : 74);
    const overallScore = clampScore(
      (clarityScore * 0.18)
      + (usefulnessScore * 0.2)
      + (reusabilityScore * 0.18)
      + (retrievalReadinessScore * 0.18)
      + (commercialValueScore * 0.12)
      + (confidenceScore * 0.14)
      - (riskScore * 0.18)
    );
    const level = qualityLevel(overallScore, riskScore);
    const action = actionForQuality({
      score: overallScore,
      level,
      riskScore,
      duplicateRisk: context.duplicateRisk
    });
    const reasons = this.buildReasons({
      clarityScore,
      usefulnessScore,
      reusabilityScore,
      retrievalReadinessScore,
      commercialValueScore,
      riskScore,
      confidenceScore,
      overallScore,
      action
    });

    return {
      overallScore,
      clarityScore,
      usefulnessScore,
      reusabilityScore,
      retrievalReadinessScore,
      commercialValueScore,
      riskScore,
      confidenceScore,
      qualityLevel: level,
      action,
      reasons,
      suggestions: this.buildSuggestions(input, {
        clarityScore,
        usefulnessScore,
        reusabilityScore,
        retrievalReadinessScore,
        commercialValueScore,
        riskScore,
        confidenceScore,
        overallScore,
        qualityLevel: level,
        action
      })
    };
  }

  scoreKnowledgeUnit(unit: KnowledgeLoopCandidate) {
    return this.evaluateKnowledgeQuality(unit);
  }

  scoreKnowledgeSet(units: KnowledgeLoopCandidate[]) {
    if (!units.length) {
      return 0;
    }

    return clampScore(units.reduce((sum, unit) => sum + this.scoreKnowledgeUnit(unit).overallScore, 0) / units.length);
  }

  detectKnowledgeGaps(units: KnowledgeLoopCandidate[], context: { expectedScenario?: boolean } = {}) {
    const gaps: string[] = [];

    if (!units.some((unit) => unit.standardQuestion || unit.suggestedQuestions.length)) {
      gaps.push("缺少用户端可命中的标准问法，建议补充真实客户问题。");
    }

    if (context.expectedScenario || !units.some((unit) => unit.scenario)) {
      gaps.push("缺少适用场景，建议说明这条知识适合什么客户/业务阶段。");
    }

    if (!units.some((unit) => unit.sopSteps?.length)) {
      gaps.push("如果要沉淀为 SOP，建议补充可执行步骤。");
    }

    return uniqueStrings(gaps, 6);
  }

  detectLowQualityKnowledge(units: KnowledgeLoopCandidate[]) {
    return units.filter((unit) => {
      const score = this.scoreKnowledgeUnit(unit);

      return score.qualityLevel === "low" || score.action === "reject" || score.riskScore >= 70;
    });
  }

  detectHighValueKnowledge(units: KnowledgeLoopCandidate[]) {
    return units.filter((unit) => {
      const score = this.scoreKnowledgeUnit(unit);

      return score.qualityLevel === "high" && score.riskScore < 60 && unit.reusable;
    });
  }

  buildImprovementSuggestions(units: KnowledgeLoopCandidate[]) {
    const suggestions = units.flatMap((unit) => this.scoreKnowledgeUnit(unit).suggestions);

    return uniqueStrings(suggestions, 8);
  }

  buildKnowledgeIntelligenceReport(units: KnowledgeLoopCandidate[], context: { duplicateRisk?: "low" | "medium" | "high" } = {}): KnowledgeIntelligenceReport {
    const scored = units.map((unit) => ({
      unit,
      quality: this.evaluateKnowledgeQuality(unit, context)
    }));
    const overallScore = scored.length
      ? clampScore(scored.reduce((sum, item) => sum + item.quality.overallScore, 0) / scored.length)
      : 0;
    const riskWarnings = uniqueStrings(scored
      .filter((item) => item.quality.riskScore >= 60)
      .map((item) => `${item.unit.title} 存在合规或承诺风险，建议人工复核。`), 6);

    return {
      overallScore,
      qualityLevel: qualityLevel(overallScore, scored.some((item) => item.quality.riskScore >= 70) ? 70 : 0),
      highValueCount: scored.filter((item) => item.quality.qualityLevel === "high").length,
      reviewRequiredCount: scored.filter((item) => item.quality.action === "review" || item.quality.action === "merge" || item.quality.action === "improve").length,
      lowQualityCount: scored.filter((item) => item.quality.qualityLevel === "low" || item.quality.action === "reject").length,
      improvementSuggestions: uniqueStrings([
        ...this.buildImprovementSuggestions(units),
        ...this.detectKnowledgeGaps(units)
      ], 8),
      mergeSuggestions: context.duplicateRisk === "high" ? ["重复风险较高，建议先合并相似 FAQ/SOP/场景话术后再入库。"] : [],
      riskWarnings,
      candidates: scored.map(({ unit, quality }) => ({
        candidateId: unit.id,
        title: unit.title,
        qualityScore: quality.overallScore,
        qualityLevel: quality.qualityLevel,
        action: quality.action,
        reasons: quality.reasons,
        suggestions: quality.suggestions
      }))
    };
  }

  private scoreRisk(text: string) {
    let score = 0;

    if (hasRiskLanguage(text)) {
      score += 62;
    }

    if (/最新|永久|一定|绝不|全部|任何/.test(text)) {
      score += 18;
    }

    if (/价格|政策|合同|发票|法律|财务/.test(text) && !/以实际|按合同|以平台|人工确认/.test(text)) {
      score += 16;
    }

    return clampScore(score);
  }

  private buildReasons(score: KnowledgeQualityScore & { action: KnowledgeIntelligenceAction }) {
    const reasons: string[] = [];

    if (score.clarityScore >= 75) {
      reasons.push("表达清晰，适合沉淀为知识。");
    }

    if (score.usefulnessScore >= 75) {
      reasons.push("业务可用性较高。");
    }

    if (score.retrievalReadinessScore >= 75) {
      reasons.push("包含可检索问法或关键词。");
    }

    if (score.commercialValueScore >= 75) {
      reasons.push("具备客服、销售或培训复用价值。");
    }

    if (score.riskScore >= 60) {
      reasons.push("存在承诺、合规或过期风险，需要人工复核。");
    }

    if (score.action === "merge") {
      reasons.push("存在相似知识，建议合并。");
    }

    return uniqueStrings(reasons, 6);
  }

  private buildSuggestions(input: KnowledgeLoopCandidate | string, score: KnowledgeQualityResult | KnowledgeQualityScore) {
    const unit = typeof input === "string" ? null : input;
    const suggestions: string[] = [];

    if (score.clarityScore < 70) {
      suggestions.push("补充更明确的标题、适用对象和业务边界。");
    }

    if (score.reusabilityScore < 70) {
      suggestions.push("补充标准问法、标准答案或可复制话术，提高复用性。");
    }

    if (score.retrievalReadinessScore < 75) {
      suggestions.push("补充用户可能搜索的关键词和真实提问方式。");
    }

    if (score.commercialValueScore < 65 && /客户|销售|客服/.test(`${unit?.content ?? input}`)) {
      suggestions.push("补充客户异议、转化话术或成交推进建议。");
    }

    if (score.riskScore >= 60) {
      suggestions.push("移除绝对化承诺，补充合规提醒和人工确认边界。");
    }

    if (unit && !unit.scenario) {
      suggestions.push("补充适用场景，方便用户端回答时选择。");
    }

    return uniqueStrings(suggestions.length ? suggestions : ["当前知识可先保存为草稿，并在后续真实问答中继续优化。"], 6);
  }
}
