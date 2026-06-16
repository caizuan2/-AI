import { getDataSource } from "@/lib/saas-core/datasource/datasource.factory";
import type {
  AIRequestRecord,
  AIStats,
  DataSourceType,
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

function success<T>(data: T, source: DataSourceType = getDataSource().type): RepositoryResult<T> {
  return { ok: true, data, source };
}

function failure<T>(error: unknown, source: DataSourceType = getDataSource().type): RepositoryResult<T> {
  return {
    ok: false,
    error: error instanceof Error ? error.message : "AI repository failed.",
    source
  };
}

async function logAIRequestWithSource(
  source: DataSourceType,
  input: LogAIRequestInput
): Promise<RepositoryResult<AIRequestRecord>> {
  try {
    return success(await getDataSource(source).ai.logAIRequest(input), source);
  } catch (error) {
    return failure(error, source);
  }
}

async function getAIStatsWithSource(source: DataSourceType, filter?: QueryFilter): Promise<RepositoryResult<AIStats>> {
  try {
    return success(await getDataSource(source).ai.getAIStats(filter), source);
  } catch (error) {
    return failure(error, source);
  }
}

export function logAIRequest(input: LogAIRequestInput): Promise<RepositoryResult<AIRequestRecord>> {
  return logAIRequestWithSource(getDataSource().type, input);
}

export function logAIRequestMock(input: LogAIRequestInput): Promise<RepositoryResult<AIRequestRecord>> {
  return logAIRequestWithSource("mock", input);
}

export function logAIRequestPrisma(input: LogAIRequestInput): Promise<RepositoryResult<AIRequestRecord>> {
  return logAIRequestWithSource("prisma", input);
}

export function getAIStats(filter?: QueryFilter): Promise<RepositoryResult<AIStats>> {
  return getAIStatsWithSource(getDataSource().type, filter);
}

export function getAIStatsMock(filter?: QueryFilter): Promise<RepositoryResult<AIStats>> {
  return getAIStatsWithSource("mock", filter);
}

export function getAIStatsPrisma(filter?: QueryFilter): Promise<RepositoryResult<AIStats>> {
  return getAIStatsWithSource("prisma", filter);
}
