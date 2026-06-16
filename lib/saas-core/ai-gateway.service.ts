import {
  getAIStats,
  logAIRequest
} from "@/lib/saas-core/repositories/ai.repository";
import type { AIRequestRecord, AIStats, LogAIRequestInput, QueryFilter, RepositoryResult } from "@/types/saas-core";

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
