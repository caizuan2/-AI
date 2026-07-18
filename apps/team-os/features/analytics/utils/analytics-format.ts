import type {
  AnalyticsMetric,
  AnalyticsMetricUnit,
  AnalyticsScopeMode
} from "@/apps/team-os/features/analytics/types";

const SCOPE_LABELS: Record<AnalyticsScopeMode, string> = {
  COMPANY: "企业范围",
  TEAM: "管理团队范围",
  TRAINING: "培训数据范围",
  SELF: "个人成长范围"
};

export function formatAnalyticsNumber(value: number | null, unit: AnalyticsMetricUnit = "COUNT") {
  if (value === null || !Number.isFinite(value)) return "暂无数据";
  const formatted = new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1
  }).format(value);
  if (unit === "PERCENT") return `${formatted}%`;
  if (unit === "SCORE") return `${formatted} 分`;
  return formatted;
}

export function formatAnalyticsMetric(metric: AnalyticsMetric) {
  return metric.available ? formatAnalyticsNumber(metric.value, metric.unit) : "暂无采集";
}

export function formatAnalyticsDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
}

export function formatAnalyticsDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function analyticsScopeLabel(scopeMode: AnalyticsScopeMode) {
  return SCOPE_LABELS[scopeMode];
}

export function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}
