import type {
  CopilotApiError,
  CopilotApiSuccess,
  CopilotAssistantRole,
  CopilotChatInput,
  CopilotChatResult,
  CopilotDashboardData,
  CopilotInsightsData,
  CopilotInsightSyncInput,
  CopilotInsightSyncResult
} from "@/apps/team-os/features/copilot/types";

export class CopilotClientError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "CopilotClientError";
  }
}

async function readResponse<T>(responseValue: Response | Promise<Response>): Promise<T> {
  const response = await responseValue;
  let parsed: unknown;
  try {
    parsed = await response.json() as unknown;
  } catch {
    throw new CopilotClientError("接口返回格式不正确，请稍后重试。");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CopilotClientError("接口返回格式不正确，请稍后重试。");
  }
  const body = parsed as CopilotApiSuccess<T> | CopilotApiError;
  if (!response.ok || body.success !== true || !("data" in body)) {
    const error = body as CopilotApiError;
    throw new CopilotClientError(
      error.message || error.error?.message || "AI 助手请求失败，请稍后重试。",
      error.code || error.error?.code
    );
  }
  return body.data;
}

const rolePath: Record<CopilotAssistantRole, string> = {
  EMPLOYEE_ASSISTANT: "employee",
  MANAGER_ASSISTANT: "manager",
  OWNER_ASSISTANT: "owner"
};

function companyQuery(companyId?: string) {
  const params = new URLSearchParams();
  if (companyId) params.set("companyId", companyId);
  return params.size > 0 ? `?${params.toString()}` : "";
}

export function fetchCopilotDashboard(role: CopilotAssistantRole, companyId?: string) {
  return readResponse<CopilotDashboardData>(fetch(
    `/api/team-os/copilot/${rolePath[role]}${companyQuery(companyId)}`,
    { cache: "no-store" }
  ));
}

export function sendCopilotChat(input: CopilotChatInput) {
  return readResponse<CopilotChatResult>(fetch("/api/team-os/copilot/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }));
}

export function fetchCopilotInsights(input: CopilotInsightSyncInput) {
  const params = new URLSearchParams({ assistantRole: input.assistantRole });
  if (input.companyId) params.set("companyId", input.companyId);
  return readResponse<CopilotInsightsData>(fetch(
    `/api/team-os/copilot/insights?${params.toString()}`,
    { cache: "no-store" }
  ));
}

export function syncCopilotInsights(input: CopilotInsightSyncInput) {
  return readResponse<CopilotInsightSyncResult>(fetch("/api/team-os/copilot/insights", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }));
}
