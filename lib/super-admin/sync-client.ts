import type {
  DeviceRisk,
  DeviceSession,
  PlatformDownload,
  PlatformVersion,
  SyncEvent,
  SyncOverview
} from "@/types/super-admin-sync";

export type SuperAdminSyncClientResult<T> = {
  ok: boolean;
  unauthorized?: boolean;
  data?: T;
  error?: string;
};

type SuperAdminApiPayload<T> = {
  success: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
  };
  timestamp?: number;
};

async function readJson<T>(response: Response): Promise<SuperAdminApiPayload<T> | null> {
  try {
    return await response.json() as SuperAdminApiPayload<T>;
  } catch {
    return null;
  }
}

async function fetchSyncApi<T>(path: string): Promise<SuperAdminSyncClientResult<T>> {
  try {
    const response = await fetch(path, {
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Accept: "application/json"
      }
    });
    const payload = await readJson<T>(response);

    if (response.status === 401) {
      return {
        ok: false,
        unauthorized: true,
        error: payload?.error?.message ?? "请使用超级管理员登录后查看三端同步数据"
      };
    }

    if (!response.ok || !payload?.success) {
      return {
        ok: false,
        error: payload?.error?.message ?? "三端同步数据加载失败"
      };
    }

    return {
      ok: true,
      data: payload.data as T
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "网络请求失败"
    };
  }
}

export function fetchSyncOverview() {
  return fetchSyncApi<SyncOverview>("/api/super-admin/sync/overview");
}

export function fetchSyncEvents() {
  return fetchSyncApi<SyncEvent[]>("/api/super-admin/sync/events");
}

export function fetchDeviceSessions() {
  return fetchSyncApi<DeviceSession[]>("/api/super-admin/devices/sessions");
}

export function fetchDeviceRisks() {
  return fetchSyncApi<DeviceRisk[]>("/api/super-admin/devices/risks");
}

export function fetchPlatformVersions() {
  return fetchSyncApi<PlatformVersion[]>("/api/super-admin/platforms/versions");
}

export function fetchPlatformDownloads() {
  return fetchSyncApi<PlatformDownload[]>("/api/super-admin/platforms/downloads");
}
