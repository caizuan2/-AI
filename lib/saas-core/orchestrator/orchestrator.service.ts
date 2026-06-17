import { executePipeline } from "@/lib/saas-core/orchestrator/execution-pipeline.service";
import { normalizeOrchestratorRequest } from "@/lib/saas-core/orchestrator/request-context";
import { decideRoute } from "@/lib/saas-core/orchestrator/route-decider.service";
import type { ExecutionResult, OrchestratorRequest } from "@/types/orchestrator";

export async function handleOrchestratedRequest(request: OrchestratorRequest): Promise<ExecutionResult> {
  const startedAt = Date.now();
  const normalizedRequest = normalizeOrchestratorRequest(request);
  const decision = decideRoute(normalizedRequest.context);
  const pipeline = await executePipeline(normalizedRequest, decision);

  if (!pipeline.success) {
    return {
      success: false,
      error: "billing_limit",
      data: pipeline.data,
      route: decision.route,
      flow: decision.flow,
      executionTime: Date.now() - startedAt,
      timestamp: Date.now(),
      steps: pipeline.steps
    };
  }

  return {
    success: true,
    data: pipeline.data,
    route: decision.route,
    flow: decision.flow,
    executionTime: Date.now() - startedAt,
    timestamp: Date.now(),
    steps: pipeline.steps
  };
}
