import { executeAIGatewayRequest, getAIGatewayStats } from "@/lib/saas-core/ai-gateway.service";
import { getConfiguredDataSourceType } from "@/lib/saas-core/datasource/datasource.factory";
import { createKnowledge, getTenantKnowledge } from "@/lib/saas-core/knowledge.service";
import { getSaaSCoreMetrics, getSaaSSystemHealth } from "@/lib/saas-core/system.service";
import { getTenant } from "@/lib/saas-core/tenant.service";
import type { Tenant } from "@/types/saas-core";
import type { OrchestratorRequest, PipelineStep, PipelineStepName, RequestContext, RouteDecision } from "@/types/orchestrator";

type PipelineOutput = {
  data: Record<string, unknown>;
  steps: PipelineStep[];
};

function getPayload(request: OrchestratorRequest): Record<string, unknown> {
  return request.payload && typeof request.payload === "object" ? request.payload as Record<string, unknown> : {};
}

function readString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];

  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readNumber(payload: Record<string, unknown>, key: string, fallback: number): number {
  const value = payload[key];

  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

async function runStep<T>(steps: PipelineStep[], name: PipelineStepName, action: () => Promise<T> | T): Promise<T> {
  const step: PipelineStep = {
    name,
    status: "pending",
    startedAt: Date.now()
  };

  steps.push(step);

  try {
    const result = await action();
    step.status = "success";
    step.completedAt = Date.now();

    return result;
  } catch (error) {
    step.status = "failed";
    step.completedAt = Date.now();
    step.message = error instanceof Error ? error.message : "Pipeline step failed.";

    throw error;
  }
}

function assertAuthenticated(context: RequestContext): void {
  if (!context.userId || !context.tenantId) {
    throw new Error("Orchestrator auth failed: userId and tenantId are required.");
  }
}

function assertRouteAllowed(context: RequestContext, decision: RouteDecision): void {
  const allowed =
    (decision.route === "user" && context.role === "user") ||
    (decision.route === "ingest" && context.role === "ingest_admin") ||
    (decision.route === "super-admin" && context.role === "super_admin");

  if (!allowed) {
    throw new Error("Orchestrator RBAC failed: role is not allowed for this route.");
  }
}

async function resolveTenant(context: RequestContext): Promise<Tenant> {
  const tenant = await getTenant(context.tenantId);

  if (!tenant) {
    throw new Error(`Tenant not found: ${context.tenantId}.`);
  }

  return tenant;
}

async function dispatchService(request: OrchestratorRequest, decision: RouteDecision): Promise<Record<string, unknown>> {
  const { context } = request;
  const payload = getPayload(request);

  if (decision.route === "user") {
    return {
      operation: "ai_chat",
      gateway: await executeAIGatewayRequest(context, payload)
    };
  }

  if (decision.route === "ingest") {
    const title = readString(payload, "title");
    const category = readString(payload, "category");
    const summary = readString(payload, "summary");

    if (title && category && summary) {
      return {
        operation: "knowledge_training",
        mode: "add",
        trainingStatus: "queued",
        record: await createKnowledge({
          tenantId: context.tenantId,
          title,
          category,
          summary
        })
      };
    }

    return {
      operation: "knowledge_training",
      mode: "list",
      trainingStatus: "ready",
      records: await getTenantKnowledge(context.tenantId, {
        page: readNumber(payload, "page", 1),
        pageSize: readNumber(payload, "pageSize", 20)
      })
    };
  }

  const [health, metrics, aiStats] = await Promise.all([
    getSaaSSystemHealth(),
    getSaaSCoreMetrics(),
    getAIGatewayStats({ tenantId: context.tenantId })
  ]);

  return {
    operation: readString(payload, "action") ?? "system_control",
    health,
    metrics,
    aiStats
  };
}

export async function executePipeline(request: OrchestratorRequest, decision: RouteDecision): Promise<PipelineOutput> {
  const steps: PipelineStep[] = [];

  await runStep(steps, "auth", () => assertAuthenticated(request.context));
  await runStep(steps, "rbac", () => assertRouteAllowed(request.context, decision));
  const resolvedTenant = await runStep(steps, "tenant resolve", () => resolveTenant(request.context));
  const service = await runStep(steps, "service selection", () => decision.service);
  const datasource = await runStep(steps, "datasource fetch", () => getConfiguredDataSourceType());
  const repositoryMode = datasource === "prisma" ? "prisma implementation" : "mock implementation";
  const dispatchResult = await runStep(steps, "repository call", () => dispatchService(request, decision));
  const data = await runStep(steps, "response transform", () => ({
    requestType: request.context.requestType,
    source: request.context.source,
    route: decision.route,
    flow: decision.flow,
    service,
    datasource,
    repositoryMode,
    tenant: resolvedTenant,
    auth: "accepted",
    result: dispatchResult
  }));

  return {
    data,
    steps
  };
}
