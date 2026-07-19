import type {
  CreateWorkflowInput,
  ExecuteWorkflowInput,
  WorkflowApiError,
  WorkflowApiSuccess,
  WorkflowDefinitionRecord,
  WorkflowExecutionListData,
  WorkflowExecutionRecord,
  WorkflowListData
} from "@/apps/team-os/features/workflow/types";

export class WorkflowClientError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "WorkflowClientError";
  }
}

async function readResponse<T>(responseValue: Response | Promise<Response>): Promise<T> {
  const response = await responseValue;
  let parsed: unknown;
  try {
    parsed = await response.json() as unknown;
  } catch {
    throw new WorkflowClientError("接口返回格式不正确，请稍后重试。");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new WorkflowClientError("接口返回格式不正确，请稍后重试。");
  }
  const body = parsed as WorkflowApiSuccess<T> | WorkflowApiError;
  if (!response.ok || body.success !== true || !("data" in body)) {
    const error = body as WorkflowApiError;
    throw new WorkflowClientError(
      error.message || error.error?.message || "工作流请求失败，请稍后重试。",
      error.code || error.error?.code
    );
  }
  return body.data;
}

function companyQuery(companyId?: string, extras?: Record<string, string>) {
  const params = new URLSearchParams(extras);
  if (companyId) params.set("companyId", companyId);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function fetchWorkflowList(companyId?: string) {
  return readResponse<WorkflowListData>(fetch(
    `/api/team-os/workflow${companyQuery(companyId)}`,
    { cache: "no-store" }
  ));
}

export function createWorkflowDefinition(input: CreateWorkflowInput) {
  return readResponse<WorkflowDefinitionRecord>(fetch("/api/team-os/workflow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }));
}

export function fetchWorkflowExecutions(companyId?: string, limit = 50) {
  return readResponse<WorkflowExecutionListData>(fetch(
    `/api/team-os/workflow/executions${companyQuery(companyId, { limit: String(limit) })}`,
    { cache: "no-store" }
  ));
}

export function testWorkflow(input: ExecuteWorkflowInput) {
  return readResponse<WorkflowExecutionRecord>(fetch("/api/team-os/workflow/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }));
}
