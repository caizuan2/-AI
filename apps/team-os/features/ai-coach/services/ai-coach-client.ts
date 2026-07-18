import type {
  AnalyzeConversationInput,
  CoachAnalysisOptions,
  CoachApiError,
  CoachApiSuccess,
  CoachDashboardData,
  CoachReport
} from "@/apps/team-os/features/ai-coach/types";

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json() as CoachApiSuccess<T> | CoachApiError;
  if (!body.success) {
    throw new Error(body.message || body.error?.message || "请求失败，请稍后重试。");
  }
  if (!response.ok || !("data" in body)) {
    throw new Error("接口返回格式不正确。");
  }
  return body.data;
}

export async function fetchCoachAnalysisOptions(): Promise<CoachAnalysisOptions> {
  return readResponse<CoachAnalysisOptions>(await fetch("/api/team-os/ai-coach/analyze", {
    cache: "no-store"
  }));
}

export async function submitCoachAnalysis(input: AnalyzeConversationInput): Promise<{
  reportId: string;
  report: CoachReport;
  reused: boolean;
  knowledgeContextMode: string;
}> {
  return readResponse(await fetch("/api/team-os/ai-coach/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }));
}

export async function fetchCoachDashboard(teamId?: string | null): Promise<CoachDashboardData> {
  const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  return readResponse<CoachDashboardData>(await fetch(`/api/team-os/ai-coach/team${query}`, {
    cache: "no-store"
  }));
}

export async function fetchCoachReport(reportId: string): Promise<CoachReport> {
  return readResponse<CoachReport>(await fetch(
    `/api/team-os/ai-coach/report/${encodeURIComponent(reportId)}`,
    { cache: "no-store" }
  ));
}
