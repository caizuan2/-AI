import { clampPercent, ratioPercent, type RagDashboardRecord } from "./dashboard_types";

export interface RagDashboard {
  hitCount: number;
  topK: number;
  contextChars: number;
  relevance_score: number;
  chunk_rank: number | null;
  rag_quality_score: number;
  hot_questions: string[];
  missed_questions: string[];
  frequent_chunks: string[];
}

export function buildRagDashboard(records: RagDashboardRecord[]): RagDashboard {
  const latest = records.at(-1);
  const totalHitCount = records.reduce((sum, record) => sum + record.hitCount, 0);
  const totalTopK = records.reduce((sum, record) => sum + record.topK, 0);
  const totalContextChars = records.reduce((sum, record) => sum + record.contextChars, 0);
  const averageRelevance = average(records.map((record) => record.relevance_score));
  const hitRate = ratioPercent(records.filter((record) => record.hitCount > 0).length, records.length);
  const relevanceScore = clampPercent(averageRelevance * 100);

  return {
    hitCount: latest?.hitCount ?? 0,
    topK: latest?.topK ?? 0,
    contextChars: latest?.contextChars ?? 0,
    relevance_score: latest?.relevance_score ?? 0,
    chunk_rank: latest?.chunk_rank ?? null,
    rag_quality_score: clampPercent(hitRate * 0.45 + relevanceScore * 0.45 + ratioPercent(totalHitCount, totalTopK) * 0.1),
    hot_questions: topValues(records.map((record) => record.query)),
    missed_questions: records.filter((record) => record.hitCount === 0).map((record) => record.query).slice(0, 10),
    frequent_chunks: topValues(records.map((record) => record.chunk_id).filter(Boolean) as string[]),
  };
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function topValues(values: string[]): string[] {
  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 10)
    .map(([value]) => value);
}
