import { getDataSource } from "@/lib/saas-core/datasource/datasource.factory";
import type { DataSourceType, RepositoryResult, SystemHealthRecord, SystemMetric } from "@/types/saas-core";

export const systemPrismaMapping = {
  health: "Prisma.SystemHealth",
  metric: "Prisma.SystemMetric"
} as const;

function success<T>(data: T, source: DataSourceType = getDataSource().type): RepositoryResult<T> {
  return { ok: true, data, source };
}

function failure<T>(error: unknown, source: DataSourceType = getDataSource().type): RepositoryResult<T> {
  return {
    ok: false,
    error: error instanceof Error ? error.message : "System repository failed.",
    source
  };
}

async function getSystemHealthWithSource(source: DataSourceType): Promise<RepositoryResult<SystemHealthRecord[]>> {
  try {
    return success(await getDataSource(source).system.getSystemHealth(), source);
  } catch (error) {
    return failure(error, source);
  }
}

async function getMetricsWithSource(source: DataSourceType): Promise<RepositoryResult<SystemMetric[]>> {
  try {
    return success(await getDataSource(source).system.getMetrics(), source);
  } catch (error) {
    return failure(error, source);
  }
}

export function getSystemHealth(): Promise<RepositoryResult<SystemHealthRecord[]>> {
  return getSystemHealthWithSource(getDataSource().type);
}

export function getSystemHealthMock(): Promise<RepositoryResult<SystemHealthRecord[]>> {
  return getSystemHealthWithSource("mock");
}

export function getSystemHealthPrisma(): Promise<RepositoryResult<SystemHealthRecord[]>> {
  return getSystemHealthWithSource("prisma");
}

export function getMetrics(): Promise<RepositoryResult<SystemMetric[]>> {
  return getMetricsWithSource(getDataSource().type);
}

export function getMetricsMock(): Promise<RepositoryResult<SystemMetric[]>> {
  return getMetricsWithSource("mock");
}

export function getMetricsPrisma(): Promise<RepositoryResult<SystemMetric[]>> {
  return getMetricsWithSource("prisma");
}
