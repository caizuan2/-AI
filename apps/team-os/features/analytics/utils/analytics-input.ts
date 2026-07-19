import { ValidationError } from "@/lib/errors";
import {
  ANALYTICS_RANGE_DAYS,
  type AnalyticsQuery,
  type AnalyticsRangeDays,
  type BusinessInsightInput
} from "@/apps/team-os/features/analytics/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalCompanyId(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !value.trim() || value.trim().length > 120) {
    throw new ValidationError("企业 ID 格式不正确。");
  }
  return value.trim();
}

function rangeDays(value: unknown): AnalyticsRangeDays {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value)
      : 30;
  if (!ANALYTICS_RANGE_DAYS.includes(parsed as AnalyticsRangeDays)) {
    throw new ValidationError("分析区间仅支持最近 7、30 或 90 天。");
  }
  return parsed as AnalyticsRangeDays;
}

export function parseAnalyticsQuery(searchParams: URLSearchParams): AnalyticsQuery {
  return {
    companyId: optionalCompanyId(searchParams.get("companyId")),
    days: rangeDays(searchParams.get("days"))
  };
}

export function parseBusinessInsightInput(value: unknown): BusinessInsightInput {
  if (!isRecord(value)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }
  return {
    companyId: optionalCompanyId(value.companyId),
    days: rangeDays(value.days)
  };
}
