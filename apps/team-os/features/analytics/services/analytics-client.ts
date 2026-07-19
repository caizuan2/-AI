import type {
  AiAnalyticsData,
  AnalyticsDashboardData,
  AnalyticsQuery,
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
  BusinessInsightData,
  BusinessInsightInput,
  CrmAnalyticsData,
  TeamAnalyticsData,
  TrainingAnalyticsData
} from "@/apps/team-os/features/analytics/types";

export class AnalyticsClientError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "AnalyticsClientError";
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  let parsed: unknown;
  try {
    parsed = await response.json() as unknown;
  } catch {
    throw new AnalyticsClientError("接口返回格式不正确，请稍后重试。");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AnalyticsClientError("接口返回格式不正确，请稍后重试。");
  }

  const body = parsed as ApiSuccessEnvelope<T> | ApiErrorEnvelope;
  if (!response.ok || body.success !== true || !("data" in body)) {
    const errorBody = body as ApiErrorEnvelope;
    throw new AnalyticsClientError(
      errorBody.message || errorBody.error?.message || "数据请求失败，请稍后重试。",
      errorBody.code || errorBody.error?.code
    );
  }

  return body.data;
}

function analyticsQuery(query: AnalyticsQuery) {
  const params = new URLSearchParams({ days: String(query.days) });
  if (query.companyId) params.set("companyId", query.companyId);
  return `?${params.toString()}`;
}

async function fetchAnalytics<T>(path: string, query: AnalyticsQuery) {
  return readResponse<T>(await fetch(`${path}${analyticsQuery(query)}`, { cache: "no-store" }));
}

export function fetchAnalyticsDashboard(query: AnalyticsQuery) {
  return fetchAnalytics<AnalyticsDashboardData>("/api/team-os/analytics", query);
}

export function fetchTeamAnalytics(query: AnalyticsQuery) {
  return fetchAnalytics<TeamAnalyticsData>("/api/team-os/analytics/team", query);
}

export function fetchCrmAnalytics(query: AnalyticsQuery) {
  return fetchAnalytics<CrmAnalyticsData>("/api/team-os/analytics/crm", query);
}

export function fetchTrainingAnalytics(query: AnalyticsQuery) {
  return fetchAnalytics<TrainingAnalyticsData>("/api/team-os/analytics/training", query);
}

export function fetchAiAnalytics(query: AnalyticsQuery) {
  return fetchAnalytics<AiAnalyticsData>("/api/team-os/analytics/ai", query);
}

export async function generateBusinessInsight(input: BusinessInsightInput) {
  return readResponse<BusinessInsightData>(await fetch("/api/team-os/analytics/insight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }));
}
