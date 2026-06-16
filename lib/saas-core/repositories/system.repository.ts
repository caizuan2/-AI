import { getDataSource } from "@/lib/saas-core/datasource/datasource.factory";
import type { RepositoryResult, SystemHealthRecord, SystemMetric } from "@/types/saas-core";

export const systemPrismaMapping = {
  health: "Prisma.SystemHealth",
  metric: "Prisma.SystemMetric"
} as const;

function success<T>(data: T): RepositoryResult<T> {
  return { ok: true, data, source: getDataSource().type };
}

function failure<T>(error: unknown): RepositoryResult<T> {
  return {
    ok: false,
    error: error instanceof Error ? error.message : "System repository failed.",
    source: getDataSource().type
  };
}

export async function getSystemHealth(): Promise<RepositoryResult<SystemHealthRecord[]>> {
  try {
    return success(await getDataSource().system.getSystemHealth());
  } catch (error) {
    return failure(error);
  }
}

export async function getMetrics(): Promise<RepositoryResult<SystemMetric[]>> {
  try {
    return success(await getDataSource().system.getMetrics());
  } catch (error) {
    return failure(error);
  }
}
