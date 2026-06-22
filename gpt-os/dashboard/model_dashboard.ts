import { clampPercent, ratioPercent, type ModelUsageRecord } from "./dashboard_types";

export interface ModelDashboard {
  gpt_4o_usage_rate: number;
  gpt_5_5_usage_rate: number;
  fallback_rate: number;
  provider_status: Record<string, number>;
  model_usage_stats: Record<string, number>;
  model_efficiency: number;
}

export function buildModelDashboard(records: ModelUsageRecord[]): ModelDashboard {
  const total = records.length;
  const fallbackCount = records.filter((record) => record.fallbackUsed).length;
  const providerStatus = countBy(records.map((record) => record.provider_status));
  const modelUsageStats = countBy(records.map((record) => record.actualModel || record.model));
  const fallbackRate = ratioPercent(fallbackCount, total);

  return {
    gpt_4o_usage_rate: ratioPercent(records.filter((record) => isModel(record, "gpt-4o")).length, total),
    gpt_5_5_usage_rate: ratioPercent(records.filter((record) => isModel(record, "gpt-5.5")).length, total),
    fallback_rate: fallbackRate,
    provider_status: providerStatus,
    model_usage_stats: modelUsageStats,
    model_efficiency: clampPercent(100 - fallbackRate),
  };
}

function isModel(record: ModelUsageRecord, model: string): boolean {
  return record.model === model || record.actualModel === model;
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }

  return counts;
}
