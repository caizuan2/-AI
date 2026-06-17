export type RequestRole = "user" | "ingest_admin" | "super_admin";

export type RequestSource = "web" | "apk" | "exe";

export type RouteType = "user" | "ingest" | "super-admin";

export type SystemFlowType = "ai_chat" | "knowledge_training" | "system_control";

export type RequestContext = {
  userId: string;
  role: RequestRole;
  tenantId: string;
  requestType: string;
  source: RequestSource;
  timestamp: number;
};

export type OrchestratorRequest<TPayload = Record<string, unknown>> = {
  context: RequestContext;
  payload?: TPayload;
};

export type PipelineStepName =
  | "auth"
  | "rbac"
  | "billing"
  | "tenant resolve"
  | "service selection"
  | "repository call"
  | "datasource fetch"
  | "response transform";

export type PipelineStep = {
  name: PipelineStepName;
  status: "pending" | "success" | "failed";
  startedAt: number;
  completedAt?: number;
  message?: string;
};

export type RouteDecision = {
  route: RouteType;
  flow: SystemFlowType;
  service: "ai-gateway" | "knowledge-service" | "system-service";
};

export type ExecutionSuccessResult<TData = unknown> = {
  success: true;
  data: TData;
  route: RouteType;
  flow: SystemFlowType;
  executionTime: number;
  timestamp: number;
  steps: PipelineStep[];
};

export type ExecutionDeniedResult<TData = unknown> = {
  success: false;
  error: "billing_limit";
  data: TData;
  route: RouteType;
  flow: SystemFlowType;
  executionTime: number;
  timestamp: number;
  steps: PipelineStep[];
};

export type ExecutionResult<TData = unknown> = ExecutionSuccessResult<TData> | ExecutionDeniedResult<TData>;
