import type {
  FeatureCheckData,
  FeatureCheckInput,
  TenantCompanyData,
  TenantSubscriptionData,
  TenantUsageData,
  UpgradeIntentInput,
  UpgradeIntentResult
} from "@/apps/team-os/features/tenant/types";

interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
}

interface ApiErrorEnvelope {
  success: false;
  code?: string;
  message?: string;
  error?: { code?: string; message?: string };
}

export class TenantClientError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "TenantClientError";
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  let parsed: unknown;
  try {
    parsed = await response.json() as unknown;
  } catch {
    throw new TenantClientError("接口返回格式不正确，请稍后重试。");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TenantClientError("接口返回格式不正确，请稍后重试。");
  }

  const body = parsed as ApiSuccessEnvelope<T> | ApiErrorEnvelope;
  if (!response.ok || body.success !== true || !("data" in body)) {
    const errorBody = body as ApiErrorEnvelope;
    throw new TenantClientError(
      errorBody.message || errorBody.error?.message || "企业数据请求失败，请稍后重试。",
      errorBody.code || errorBody.error?.code
    );
  }

  return body.data;
}

function companyQuery(companyId?: string) {
  if (!companyId) return "";
  return `?companyId=${encodeURIComponent(companyId)}`;
}

async function fetchTenantResource<T>(path: string, companyId?: string) {
  return readResponse<T>(await fetch(`${path}${companyQuery(companyId)}`, { cache: "no-store" }));
}

export function fetchTenantCompany(companyId?: string) {
  return fetchTenantResource<TenantCompanyData>("/api/team-os/company", companyId);
}

export function fetchTenantSubscription(companyId?: string) {
  return fetchTenantResource<TenantSubscriptionData>("/api/team-os/subscription", companyId);
}

export function fetchTenantUsage(companyId?: string) {
  return fetchTenantResource<TenantUsageData>("/api/team-os/usage", companyId);
}

export async function requestSubscriptionUpgrade(input: UpgradeIntentInput) {
  return readResponse<UpgradeIntentResult>(await fetch("/api/team-os/subscription/upgrade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }));
}

export async function checkTenantFeature(input: FeatureCheckInput) {
  const params = new URLSearchParams({ featureKey: input.featureKey });
  if (input.companyId) params.set("companyId", input.companyId);
  return readResponse<FeatureCheckData>(await fetch(`/api/team-os/features/check?${params.toString()}`, {
    cache: "no-store"
  }));
}
