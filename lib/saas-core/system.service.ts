import {
  getMetrics,
  getSystemHealth
} from "@/lib/saas-core/repositories/system.repository";
import type { RepositoryResult, SystemHealthRecord, SystemMetric } from "@/types/saas-core";

function unwrap<T>(result: RepositoryResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error);
  }

  return result.data;
}

export async function getSaaSSystemHealth(): Promise<SystemHealthRecord[]> {
  return unwrap(await getSystemHealth());
}

export async function getSaaSCoreMetrics(): Promise<SystemMetric[]> {
  return unwrap(await getMetrics());
}
