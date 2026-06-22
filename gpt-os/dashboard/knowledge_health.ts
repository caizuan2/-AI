import { clampPercent, ratioPercent, type KnowledgeHealthRecord } from "./dashboard_types";

export interface KnowledgeHealthDashboard {
  missing_knowledge_count: number;
  low_relevance_topics: string[];
  repeated_questions: string[];
  coverage_score: number;
  knowledge_gap_count: number;
}

export function buildKnowledgeHealthDashboard(records: KnowledgeHealthRecord[]): KnowledgeHealthDashboard {
  const missing = records.filter((record) => record.missing_knowledge);
  const lowRelevance = records.filter((record) => record.relevance_score < 0.3);
  const repeated = records.filter((record) => (record.repeated_count ?? 0) >= 3);
  const providedCoverage = records
    .map((record) => record.coverage_score)
    .filter((score): score is number => typeof score === "number");
  const coverageScore = providedCoverage.length > 0
    ? clampPercent(providedCoverage.reduce((sum, score) => sum + score, 0) / providedCoverage.length)
    : ratioPercent(records.length - missing.length, records.length);

  return {
    missing_knowledge_count: missing.length,
    low_relevance_topics: lowRelevance.map((record) => record.query).slice(0, 10),
    repeated_questions: repeated.map((record) => record.query).slice(0, 10),
    coverage_score: coverageScore,
    knowledge_gap_count: missing.length + lowRelevance.length,
  };
}
