import { handleOrchestratedRequest } from "@/lib/saas-core/orchestrator/orchestrator.service";
import type { ExecutionResult, OrchestratorRequest } from "@/types/orchestrator";

export const systemEntry = {
  handle(request: OrchestratorRequest): Promise<ExecutionResult> {
    return handleOrchestratedRequest(request);
  }
};

export function handleSystemRequest(request: OrchestratorRequest): Promise<ExecutionResult> {
  return systemEntry.handle(request);
}
