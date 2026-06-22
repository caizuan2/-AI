import {
  superAdminDeviceRisks,
  superAdminDeviceSessions,
  superAdminPlatformDownloads,
  superAdminPlatformSyncStatuses,
  superAdminPlatformVersions,
  superAdminSyncEvents,
  superAdminSyncMatrixRows
} from "@/lib/enterprise/mock-data";
import type {
  DeviceRisk,
  DeviceSession,
  PlatformDownload,
  PlatformSyncStatus,
  PlatformVersion,
  SyncEvent,
  SyncHealth,
  SyncMatrixRow,
  SyncOverview
} from "@/types/super-admin-sync";

function rankHealth(health: SyncHealth) {
  if (health === "error") {
    return 3;
  }

  if (health === "warning") {
    return 2;
  }

  return 1;
}

function getWorstHealth(platforms: PlatformSyncStatus[]): SyncHealth {
  return platforms.reduce<SyncHealth>((current, item) =>
    rankHealth(item.syncHealth) > rankHealth(current) ? item.syncHealth : current,
  "healthy");
}

export function getSyncOverview(): SyncOverview {
  const platforms = getPlatformSyncStatuses();
  const pendingSyncCount = platforms.reduce((sum, item) => sum + item.pendingSyncCount, 0);
  const failedSyncCount = platforms.reduce((sum, item) => sum + item.failedSyncCount, 0);
  const conflictCount = platforms.reduce((sum, item) => sum + item.conflictCount, 0);
  const averageLatencyMs = Math.round(platforms.reduce((sum, item) => sum + item.latencyMs, 0) / Math.max(platforms.length, 1));
  const syncHealth = getWorstHealth(platforms);

  return {
    platforms,
    matrix: getSyncMatrix(),
    summary: {
      onlineDeviceCount: getDeviceSessions().filter((item) => item.sessionStatus === "active").length,
      lastSyncAt: platforms[0]?.lastSyncAt ?? "未同步",
      pendingSyncCount,
      failedSyncCount,
      consistencyStatus: conflictCount > 0 ? "warning" : syncHealth,
      averageLatencyMs,
      conflictCount,
      syncHealth
    }
  };
}

export function getPlatformSyncStatuses(): PlatformSyncStatus[] {
  return superAdminPlatformSyncStatuses;
}

export function getSyncMatrix(): SyncMatrixRow[] {
  return superAdminSyncMatrixRows;
}

export function getSyncEvents(): SyncEvent[] {
  return superAdminSyncEvents;
}

export function getDeviceSessions(): DeviceSession[] {
  return superAdminDeviceSessions;
}

export function getDeviceRisks(): DeviceRisk[] {
  return superAdminDeviceRisks;
}

export function getPlatformVersions(): PlatformVersion[] {
  return superAdminPlatformVersions;
}

export function getPlatformDownloads(): PlatformDownload[] {
  return superAdminPlatformDownloads;
}
