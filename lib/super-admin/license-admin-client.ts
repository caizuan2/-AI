import type {
  SuperAdminLicenseDashboardData,
  SuperAdminLicenseGenerationInput,
  SuperAdminLicenseGenerationResult,
  SuperAdminLicenseRecord,
  SuperAdminLicenseRenewalInput
} from "@/types/super-admin-licenses";

type SuperAdminClientResponse<T> = {
  success: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
  };
};

async function parseJson<T>(response: Response): Promise<SuperAdminClientResponse<T>> {
  try {
    return (await response.json()) as SuperAdminClientResponse<T>;
  } catch {
    return {
      success: false,
      error: {
        message: "接口返回无法解析。"
      }
    };
  }
}

async function requestSuperAdmin<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const payload = await parseJson<T>(response);

  if (!response.ok || !payload.success || payload.data === undefined) {
    throw new Error(payload.error?.message ?? "超级管理员卡密接口请求失败。");
  }

  return payload.data;
}

export function fetchSuperAdminLicenses() {
  return requestSuperAdmin<SuperAdminLicenseDashboardData>("/api/super-admin/licenses");
}

export function generateSuperAdminLicenses(input: SuperAdminLicenseGenerationInput) {
  return requestSuperAdmin<SuperAdminLicenseGenerationResult>("/api/super-admin/licenses/generate", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function disableSuperAdminLicense(id: string) {
  return requestSuperAdmin<SuperAdminLicenseRecord>(`/api/super-admin/licenses/${encodeURIComponent(id)}/disable`, {
    method: "POST"
  });
}

export function renewSuperAdminLicense(id: string, input: SuperAdminLicenseRenewalInput) {
  return requestSuperAdmin<SuperAdminLicenseRecord>(`/api/super-admin/licenses/${encodeURIComponent(id)}/renew`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}
