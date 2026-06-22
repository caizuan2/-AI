import { systemHealthItems } from "@/lib/enterprise/mock-data";
import type { HealthStatus, SystemHealth } from "@/types/super-admin";

function mapStatus(status: SystemHealth["status"]): HealthStatus {
  if (status === "critical") {
    return "error";
  }

  if (status === "warning" || status === "pending") {
    return "warning";
  }

  return "healthy";
}

export function getSystemHealth(): SystemHealth[] {
  return systemHealthItems.map((item) => ({
    ...item,
    health: mapStatus(item.status)
  }));
}

export function checkApiStatus(): HealthStatus {
  return "healthy";
}

export function checkDatabaseStatus(): HealthStatus {
  return "healthy";
}

export function checkAiModelStatus(): HealthStatus {
  return "warning";
}

export function checkStorageStatus(): HealthStatus {
  return "healthy";
}
