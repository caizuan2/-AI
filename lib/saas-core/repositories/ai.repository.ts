import { getDataSource } from "@/lib/saas-core/datasource/datasource.factory";
import type {
  AIRequestRecord,
  AIStats,
  LogAIRequestInput,
  PrismaEntityMapping,
  QueryFilter,
  RepositoryResult
} from "@/types/saas-core";

export const aiRequestPrismaMapping: PrismaEntityMapping<"AIRequest"> = {
  entity: "AIRequest",
  prismaModel: "Prisma.AIRequest",
  fields: {
    id: "id",
    tenantId: "tenantId",
    userId: "userId",
    model: "model",
    tokens: "tokens",
    status: "status",
    costUsd: "costUsd",
    createdAt: "createdAt"
  }
};

function success<T>(data: T): RepositoryResult<T> {
  return { ok: true, data, source: getDataSource().type };
}

function failure<T>(error: unknown): RepositoryResult<T> {
  return {
    ok: false,
    error: error instanceof Error ? error.message : "AI repository failed.",
    source: getDataSource().type
  };
}

export async function logAIRequest(input: LogAIRequestInput): Promise<RepositoryResult<AIRequestRecord>> {
  try {
    return success(await getDataSource().ai.logAIRequest(input));
  } catch (error) {
    return failure(error);
  }
}

export async function getAIStats(filter?: QueryFilter): Promise<RepositoryResult<AIStats>> {
  try {
    return success(await getDataSource().ai.getAIStats(filter));
  } catch (error) {
    return failure(error);
  }
}
