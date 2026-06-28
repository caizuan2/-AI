export type IngestStateDomain = "auth" | "model_health" | "ingest" | "no_access" | "ui_transient" | "unknown";

export type IngestToastGuardInput = {
  reason?: string;
  stateDomain?: IngestStateDomain;
  requestId?: string;
  activeRequestId?: string;
  hasCurrentSuccess?: boolean;
  lastSuccessfulAt?: number;
  suppressUntil?: number;
  status?: number;
  errorCode?: string;
};

function normalizeSignal(value: unknown) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function includesAny(value: string, signals: string[]) {
  return signals.some((signal) => value.includes(signal));
}

export function getStateDomain(errorOrResult: unknown): IngestStateDomain {
  const raw = errorOrResult instanceof Error
    ? `${errorOrResult.name} ${errorOrResult.message}`
    : typeof errorOrResult === "string"
      ? errorOrResult
      : JSON.stringify(errorOrResult ?? {});
  const text = normalizeSignal(raw);

  if (includesAny(text, [
    "no_ingest_access",
    "license_app_type_mismatch",
    "no-access",
    "forbidden",
    "403",
    "没有权限",
    "不能访问",
    "卡密",
    "授权"
  ])) {
    return "no_access";
  }

  if (includesAny(text, [
    "auth_required",
    "invalid_session",
    "unauthorized",
    "401",
    "请先登录",
    "重新登录",
    "登录状态",
    "authenticated:false",
    "authenticated false"
  ])) {
    return "auth";
  }

  if (includesAny(text, [
    "model_health_failure",
    "model health",
    "health check",
    "模型健康",
    "provider unavailable",
    "model disabled",
    "openai unavailable",
    "gpt-5.5",
    "gpt-55"
  ])) {
    return "model_health";
  }

  if (includesAny(text, [
    "ingest",
    "provider",
    "network",
    "timeout",
    "abort",
    "failed to fetch",
    "500",
    "502",
    "503",
    "504"
  ])) {
    return "ingest";
  }

  return "unknown";
}

export function shouldSuppressFallbackToast(input: IngestToastGuardInput) {
  const now = Date.now();
  const reason = normalizeSignal(input.reason);
  const errorCode = normalizeSignal(input.errorCode);
  const stateDomain = input.stateDomain ?? "unknown";

  if (input.hasCurrentSuccess === true) {
    return true;
  }

  if (typeof input.suppressUntil === "number" && now < input.suppressUntil) {
    return true;
  }

  if (input.requestId && input.activeRequestId && input.requestId !== input.activeRequestId) {
    return true;
  }

  if (
    stateDomain === "auth"
    || stateDomain === "model_health"
    || stateDomain === "no_access"
    || stateDomain === "ui_transient"
  ) {
    return true;
  }

  if (input.status === 401 || input.status === 403) {
    return true;
  }

  if (includesAny(errorCode, [
    "auth_required",
    "invalid_session",
    "no_ingest_access",
    "license_app_type_mismatch"
  ])) {
    return true;
  }

  if (includesAny(reason, [
    "health",
    "auth",
    "no-access",
    "no_access",
    "stale",
    "old request",
    "old-request",
    "expired",
    "model_health",
    "ui_transient"
  ])) {
    return true;
  }

  return false;
}

export function isRealIngestFailure(input: IngestToastGuardInput) {
  const reason = normalizeSignal(input.reason);
  const errorCode = normalizeSignal(input.errorCode);
  const stateDomain = input.stateDomain ?? "unknown";

  if (shouldSuppressFallbackToast(input)) {
    return false;
  }

  if (stateDomain !== "ingest" && stateDomain !== "unknown") {
    return false;
  }

  if (input.status === 500 || input.status === 502 || input.status === 503 || input.status === 504) {
    return true;
  }

  if (includesAny(errorCode, [
    "ingest_failure",
    "provider_error",
    "provider_crash",
    "network_error",
    "timeout",
    "request_failed"
  ])) {
    return true;
  }

  return includesAny(reason, [
    "network",
    "timeout",
    "failed to fetch",
    "provider crash",
    "provider error",
    "http 500",
    "http 502",
    "http 503",
    "http 504",
    "ok === false",
    "success === false"
  ]);
}

export function shouldClearTransientErrorOnAgentSwitch() {
  return true;
}

export function shouldRestoreToastFromHistory() {
  return false;
}
