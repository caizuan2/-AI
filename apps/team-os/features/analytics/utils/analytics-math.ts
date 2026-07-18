import type {
  AnalyticsDailyPoint,
  AnalyticsMetric,
  AnalyticsRange,
  AnalyticsRangeDays
} from "@/apps/team-os/features/analytics/types";

const CHINA_OFFSET_MS = 8 * 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;

export function roundValue(value: number, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function average(values: number[]) {
  return values.length > 0
    ? roundValue(values.reduce((sum, value) => sum + value, 0) / values.length, 1)
    : null;
}

export function percentage(numerator: number, denominator: number) {
  return denominator > 0 ? roundValue(numerator / denominator * 100, 1) : null;
}

export function dateKeyInChina(value: Date) {
  return new Date(value.getTime() + CHINA_OFFSET_MS).toISOString().slice(0, 10);
}

export function analyticsRange(days: AnalyticsRangeDays, now = new Date()): {
  range: AnalyticsRange;
  start: Date;
  end: Date;
  dateKeys: string[];
} {
  const today = dateKeyInChina(now);
  const todayStart = new Date(`${today}T00:00:00+08:00`);
  const end = new Date(todayStart.getTime() + DAY_MS);
  const start = new Date(end.getTime() - days * DAY_MS);
  const dateKeys = Array.from({ length: days }, (_, index) =>
    dateKeyInChina(new Date(start.getTime() + index * DAY_MS))
  );
  return {
    range: {
      days,
      startDate: dateKeys[0] ?? today,
      endDate: today,
      label: `最近 ${days} 天`
    },
    start,
    end,
    dateKeys
  };
}

export function chinaTodayRange(now = new Date()) {
  const today = dateKeyInChina(now);
  const start = new Date(`${today}T00:00:00+08:00`);
  return { date: today, start, end: new Date(start.getTime() + DAY_MS) };
}

export function metric(input: {
  value: number | null;
  unit: AnalyticsMetric["unit"];
  sampleSize: number;
  definition: string;
}): AnalyticsMetric {
  return {
    ...input,
    available: input.value !== null
  };
}

export function emptyDailyPoints(dateKeys: string[]) {
  return new Map<string, AnalyticsDailyPoint>(dateKeys.map((date) => [date, {
    date,
    taskCompletionRate: null,
    employeeAverageScore: null,
    customerConversionRate: null,
    trainingCompletionRate: null,
    aiOutputCount: 0
  }]));
}

export function growthLevel(value: number | null): "优秀" | "良好" | "成长中" | "需关注" | "暂无数据" {
  if (value === null) return "暂无数据";
  if (value >= 85) return "优秀";
  if (value >= 75) return "良好";
  if (value >= 60) return "成长中";
  return "需关注";
}
