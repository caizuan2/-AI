import { ratioPercent, type FallbackRecord } from "./dashboard_types";

export interface FallbackMonitor {
  fallback_count: number;
  fallback_rate: number;
  fallback_reasons: Record<string, number>;
  provider_failure_rate: number;
  rate_limit_count: number;
  timeout_count: number;
  invalid_key_count: number;
}

export function buildFallbackMonitor(records: FallbackRecord[]): FallbackMonitor {
  const fallbackRecords = records.filter((record) => record.provider_status !== "ok");
  const reasons = countBy(fallbackRecords.map((record) => record.reason ?? classifyReason(record.errorCode)));

  return {
    fallback_count: fallbackRecords.length,
    fallback_rate: ratioPercent(fallbackRecords.length, records.length),
    fallback_reasons: reasons,
    provider_failure_rate: ratioPercent(
      fallbackRecords.filter((record) => record.provider_status === "error").length,
      records.length,
    ),
    rate_limit_count: reasons.rate_limit ?? 0,
    timeout_count: reasons.timeout ?? 0,
    invalid_key_count: reasons.invalid_key ?? 0,
  };
}

function classifyReason(errorCode?: string): NonNullable<FallbackRecord["reason"]> {
  const normalized = (errorCode ?? "").toLowerCase();

  if (normalized.includes("rate")) {
    return "rate_limit";
  }

  if (normalized.includes("timeout")) {
    return "timeout";
  }

  if (normalized.includes("key") || normalized.includes("auth")) {
    return "invalid_key";
  }

  if (normalized) {
    return "provider_error";
  }

  return "unknown";
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }

  return counts;
}
