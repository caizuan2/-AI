export interface KnowledgeQualityScores {
  clarityScore: number;
  completenessScore: number;
  usefulnessScore: number;
  confidenceScore: number;
}

export const knowledgeQualityScoreKeys = [
  "clarityScore",
  "completenessScore",
  "usefulnessScore",
  "confidenceScore"
] as const;

export const knowledgeQualityScoreLabels: Record<keyof KnowledgeQualityScores, string> = {
  clarityScore: "清晰度",
  completenessScore: "完整度",
  usefulnessScore: "有用性",
  confidenceScore: "可信度"
};

export const defaultKnowledgeQualityScores: KnowledgeQualityScores = {
  clarityScore: 3,
  completenessScore: 3,
  usefulnessScore: 3,
  confidenceScore: 3
};

export function normalizeQualityScore(value: unknown, fallback = 3) {
  const score = typeof value === "number" ? Math.round(value) : fallback;

  if (!Number.isFinite(score)) {
    return fallback;
  }

  return Math.min(5, Math.max(1, score));
}

export function normalizeQualityScores(value: Partial<KnowledgeQualityScores>): KnowledgeQualityScores {
  return {
    clarityScore: normalizeQualityScore(value.clarityScore, defaultKnowledgeQualityScores.clarityScore),
    completenessScore: normalizeQualityScore(value.completenessScore, defaultKnowledgeQualityScores.completenessScore),
    usefulnessScore: normalizeQualityScore(value.usefulnessScore, defaultKnowledgeQualityScores.usefulnessScore),
    confidenceScore: normalizeQualityScore(value.confidenceScore, defaultKnowledgeQualityScores.confidenceScore)
  };
}

export function getKnowledgeQualityAverage(scores: KnowledgeQualityScores) {
  const total = knowledgeQualityScoreKeys.reduce((sum, key) => sum + scores[key], 0);

  return Math.round((total / knowledgeQualityScoreKeys.length) * 10) / 10;
}

export function isLowQualityKnowledge(scores: KnowledgeQualityScores) {
  return getKnowledgeQualityAverage(scores) < 3 || knowledgeQualityScoreKeys.some((key) => scores[key] < 3);
}
