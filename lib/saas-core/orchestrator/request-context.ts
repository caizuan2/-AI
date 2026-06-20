import type { OrchestratorRequest, RequestContext, RequestRole, RequestSource } from "@/types/orchestrator";

const allowedRoles: RequestRole[] = ["user", "ingest_admin", "super_admin"];
const allowedSources: RequestSource[] = ["web", "apk", "exe"];

function assertString(value: unknown, field: keyof RequestContext): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid orchestrator context: ${field} is required.`);
  }

  return value.trim();
}

export function normalizeRequestContext(input: Partial<RequestContext> | undefined): RequestContext {
  if (!input) {
    throw new Error("Invalid orchestrator request: context is required.");
  }

  const role = assertString(input.role, "role") as RequestRole;
  const source = assertString(input.source, "source") as RequestSource;

  if (!allowedRoles.includes(role)) {
    throw new Error(`Unsupported orchestrator role: ${role}.`);
  }

  if (!allowedSources.includes(source)) {
    throw new Error(`Unsupported orchestrator source: ${source}.`);
  }

  return {
    userId: assertString(input.userId, "userId"),
    role,
    tenantId: assertString(input.tenantId, "tenantId"),
    requestType: assertString(input.requestType, "requestType"),
    source,
    timestamp: typeof input.timestamp === "number" && input.timestamp > 0 ? input.timestamp : Date.now()
  };
}

export function normalizeOrchestratorRequest<TPayload = Record<string, unknown>>(
  input: Partial<OrchestratorRequest<TPayload>>
): OrchestratorRequest<TPayload> {
  return {
    context: normalizeRequestContext(input.context),
    payload: input.payload
  };
}
