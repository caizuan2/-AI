import type { RagContext } from "@/lib/ai/rag-prompt";
import type { AiChatMode, RetrievedRagChunk } from "@/lib/rag/search";

import type { AgentIntent, AgentRuntimeResult } from "../agent/agent_runtime";
import { recordGptOsTrace } from "../diagnostics/trace_logger";
import type { GptOsSystemTrace } from "../diagnostics/system_trace";
import { createGrowthEnhancerState, type GrowthEnhancerState } from "./growth_enhancer";
import { routeModel, type ModelRouteDecision, type ModelRouteInput } from "./model_router";
import {
  buildRagControllerDiagnostics,
  createRagControllerPlan,
  type RagControllerDiagnostics,
  type RagControllerPlan
} from "./rag_controller";
import { createGptOsRuntime, type GptOsRuntime } from "./runtime";

export interface GptOsCoreInput extends Omit<ModelRouteInput, "requestId"> {
  query: string;
  userId: string;
  sessionId: string;
  requestId?: string;
  mode: "chat";
  chatMode: AiChatMode;
}

export interface GptOsCoreResult {
  trace_id: string;
  request_id: string;
  startedAt: number;
  route: ModelRouteDecision;
  rag: RagControllerPlan;
  growthEnhancer: GrowthEnhancerState;
  agentEnabled: boolean;
  agentIntent: AgentIntent | null;
  runtime: GptOsRuntime;
}

export interface GptOsTraceUpdateInput {
  provider_status: string;
  fallbackUsed?: boolean;
  actualModel?: string | null;
  diagnostics: RagControllerDiagnostics;
  metadata?: Record<string, unknown>;
}

function createTraceId() {
  return `gptos_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createGptOsCore(input: GptOsCoreInput): GptOsCoreResult {
  const startedAt = Date.now();
  const traceId = input.requestId ?? createTraceId();
  const runtime = createGptOsRuntime(input.sessionId);
  const agentIntent = runtime.agentRuntime.canHandle(input.intent) ? input.intent : null;
  const route = routeModel({
    intent: input.intent,
    query: input.query,
    reasoningRequested: input.reasoningRequested,
    reasoningAvailable: input.reasoningAvailable,
    cost_mode: input.cost_mode,
    requestId: traceId,
  });
  const rag = createRagControllerPlan({
    query: input.query,
    mode: input.chatMode,
  });

  return {
    trace_id: traceId,
    request_id: traceId,
    startedAt,
    route,
    rag,
    growthEnhancer: createGrowthEnhancerState(),
    agentEnabled: agentIntent !== null,
    agentIntent,
    runtime,
  };
}

export function buildGptOsRagDiagnostics(
  context: GptOsCoreResult,
  chunks: RetrievedRagChunk[],
  ragContexts: RagContext[],
): RagControllerDiagnostics {
  return buildRagControllerDiagnostics(context.rag, chunks, ragContexts);
}

export function routeGptOsModel(
  context: GptOsCoreResult,
  input: Omit<ModelRouteInput, "requestId">,
): GptOsCoreResult {
  return {
    ...context,
    route: routeModel({
      ...input,
      requestId: context.trace_id,
    }),
  };
}

export function recordGptOsKernelTrace(
  context: GptOsCoreResult,
  input: GptOsTraceUpdateInput,
): GptOsSystemTrace {
  return recordGptOsTrace(context.runtime.traceLogger, {
    trace_id: context.trace_id,
    request_id: context.request_id,
    model: context.route.model,
    actualModel: input.actualModel?.trim() || context.route.actualModel,
    route_decision: context.route.route_decision,
    fallbackUsed: input.fallbackUsed ?? context.route.fallbackUsed,
    provider_status: input.provider_status,
    rag_topK: input.diagnostics.rag_topK,
    hitCount: input.diagnostics.hitCount,
    contextChars: input.diagnostics.contextChars,
    latency_ms: Date.now() - context.startedAt,
    metadata: {
      growthEnhancer: context.growthEnhancer,
      agentEnabled: context.agentEnabled,
      modelRouter: {
        provider: context.route.provider,
        fallback_chain: context.route.fallback_chain,
        fallback_chain_v2: context.route.fallback_chain_v2,
        provider_fallback_chain: context.route.provider_fallback_chain,
        model_weights: context.route.model_weights,
        reasoning: context.route.reasoning,
        reasoning_type: context.route.reasoning_type,
        cost_mode: context.route.cost_mode,
        rag_signal: context.route.rag_signal,
        provider_status: context.route.provider_status,
        learning_trace: context.route.learning_trace,
      },
      ...(input.metadata ?? {}),
    },
  });
}

export function runGptOsAgent(context: GptOsCoreResult, query: string, userId: string, sessionId: string): AgentRuntimeResult | null {
  if (!context.agentIntent) {
    return null;
  }

  return context.runtime.agentRuntime.run({
    query,
    userId,
    sessionId,
    intent: context.agentIntent,
    model: context.route.model,
    actualModel: context.route.actualModel,
    traceId: context.trace_id,
  });
}

export const os_core = {
  process: createGptOsCore,
  routeModel: routeGptOsModel,
  buildRagDiagnostics: buildGptOsRagDiagnostics,
  recordTrace: recordGptOsKernelTrace,
  runAgent: runGptOsAgent,
};
