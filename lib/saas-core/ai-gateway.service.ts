import {
  getAIStats,
  logAIRequest
} from "@/lib/saas-core/repositories/ai.repository";
import { searchTenantKnowledge } from "@/lib/saas-core/knowledge.service";
import type { AIRequestRecord, AIStats, LogAIRequestInput, QueryFilter, RepositoryResult } from "@/types/saas-core";
import type { ExecutionResult, OrchestratorRequest, RequestContext } from "@/types/orchestrator";

type AIGatewayExecutionPayload = Record<string, unknown>;

function unwrap<T>(result: RepositoryResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error);
  }

  return result.data;
}

export async function recordAIRequest(input: LogAIRequestInput): Promise<AIRequestRecord> {
  return unwrap(await logAIRequest(input));
}

export async function getAIGatewayStats(filter?: QueryFilter): Promise<AIStats> {
  return unwrap(await getAIStats(filter));
}

export function selectAIModel(context: RequestContext, payload: AIGatewayExecutionPayload = {}): string {
  const requestedModel = payload.model;

  if (typeof requestedModel === "string" && requestedModel.trim().length > 0) {
    return requestedModel.trim();
  }

  return context.role === "super_admin" ? "gpt-4.1-mini" : "gpt-4o-mini";
}

export async function executeAIGatewayRequest(
  context: RequestContext,
  payload: AIGatewayExecutionPayload = {}
): Promise<Record<string, unknown>> {
  const query = typeof payload.query === "string" ? payload.query : typeof payload.prompt === "string" ? payload.prompt : "";
  const model = selectAIModel(context, payload);
  const answer = query
    ? `Mock AI response for "${query}".`
    : "Mock AI response generated through the enterprise orchestrator.";
  const citations = await searchTenantKnowledge({
    tenantId: context.tenantId,
    search: query || undefined,
    page: 1,
    pageSize: 3
  });
  const tokens = typeof payload.tokens === "number" && Number.isFinite(payload.tokens) ? payload.tokens : Math.max(128, query.length * 2);
  const requestLog = await recordAIRequest({
    tenantId: context.tenantId,
    userId: context.userId,
    model,
    tokens,
    status: "success",
    costUsd: Number((tokens * 0.000002).toFixed(6)),
    prompt: query,
    response: answer
  });

  return {
    model,
    answer,
    citations,
    requestLog
  };
}

export async function forwardAIRequestToOrchestrator(request: OrchestratorRequest): Promise<ExecutionResult> {
  const { systemEntry } = await import("@/lib/saas-core/orchestrator/system-entry.service");

  return systemEntry.handle(request);
}
