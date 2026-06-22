import type {
  SuperAdminRolePolicy,
  SuperAdminUserAuditResponse,
  SuperAdminUserDetail,
  SuperAdminUsersResponse
} from "@/types/super-admin-users";

export type SuperAdminUserClientResult<T> = {
  ok: boolean;
  unauthorized?: boolean;
  data?: T;
  error?: string;
  code?: string;
};

type SuperAdminApiPayload<T> = {
  success: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
  } | string;
  message?: string;
  timestamp?: number;
};

async function readJson<T>(response: Response): Promise<SuperAdminApiPayload<T> | null> {
  try {
    return await response.json() as SuperAdminApiPayload<T>;
  } catch {
    return null;
  }
}

function getPayloadCode(payload: SuperAdminApiPayload<unknown> | null) {
  return typeof payload?.error === "string" ? payload.error : payload?.error?.code;
}

function getPayloadMessage(payload: SuperAdminApiPayload<unknown> | null, fallback: string) {
  if (payload?.message) {
    return payload.message;
  }

  if (typeof payload?.error === "string") {
    return payload.error;
  }

  return payload?.error?.message ?? fallback;
}

async function requestUserAdminApi<T>(path: string, init?: RequestInit): Promise<SuperAdminUserClientResult<T>> {
  try {
    const response = await fetch(path, {
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {})
      },
      ...init
    });
    const payload = await readJson<T>(response);

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        unauthorized: true,
        code: getPayloadCode(payload),
        error: getPayloadMessage(payload, "请使用超级管理员登录后查看用户授权数据。")
      };
    }

    if (!response.ok || !payload?.success) {
      return {
        ok: false,
        code: getPayloadCode(payload),
        error: getPayloadMessage(payload, "用户授权数据加载失败。")
      };
    }

    return {
      ok: true,
      data: payload.data as T
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "网络请求失败。"
    };
  }
}

export function fetchSuperAdminUsers(query = "") {
  return requestUserAdminApi<SuperAdminUsersResponse>(`/api/super-admin/users${query}`);
}

export function fetchSuperAdminUserDetail(userId: string) {
  return requestUserAdminApi<SuperAdminUserDetail>(`/api/super-admin/users/${encodeURIComponent(userId)}`);
}

export function updateSuperAdminUserRole(userId: string, role: string, reason: string) {
  return requestUserAdminApi(`/api/super-admin/users/${encodeURIComponent(userId)}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role, reason })
  });
}

export function updateSuperAdminUserStatus(userId: string, isActive: boolean, reason: string) {
  return requestUserAdminApi(`/api/super-admin/users/${encodeURIComponent(userId)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ isActive, reason })
  });
}

export function fetchSuperAdminUserAudit() {
  return requestUserAdminApi<SuperAdminUserAuditResponse>("/api/super-admin/users/audit");
}

export function fetchSuperAdminRoles() {
  return requestUserAdminApi<{
    roles: SuperAdminRolePolicy[];
    syncedPlatforms: string[];
    boundary: Record<string, string>;
  }>("/api/super-admin/roles");
}
