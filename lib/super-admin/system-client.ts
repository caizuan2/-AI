import type { DataSourceHealth, EnvConfigStatus } from "@/types/super-admin-system";

export type SuperAdminSystemClientResult<T> = {
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

async function fetchSystemApi<T>(path: string): Promise<SuperAdminSystemClientResult<T>> {
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
        error: payload?.error?.message ?? "请使用超级管理员登录后查看环境检查数据"
      };
    }

    if (!response.ok || !payload?.success) {
      return {
        ok: false,
        error: payload?.error?.message ?? "环境检查数据加载失败"
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

export function fetchEnvironmentCheck() {
  return fetchSystemApi<EnvConfigStatus>("/api/super-admin/system/env-check");
}

export function fetchDataSourceStatus() {
  return fetchSystemApi<DataSourceHealth>("/api/super-admin/system/data-source");
}
