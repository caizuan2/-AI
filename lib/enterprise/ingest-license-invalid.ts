import { readApiErrorCode } from "@/lib/api/client";

export const INGEST_LICENSE_CHECK_INTERVAL_MS = 60_000;

export type IngestLicenseInvalidCode = "LICENSE_DISABLED" | "LICENSE_EXPIRED";

export type IngestLicenseSignal = IngestLicenseInvalidCode | null;

type UnknownRecord = Record<string, unknown>;

type GuardedFetchOptions = {
  fetch: typeof fetch;
  baseOrigin: string;
  isEnabled?: () => boolean;
  getInvalidCode: () => IngestLicenseInvalidCode | null;
  onInvalid: (code: IngestLicenseInvalidCode) => void;
};

type IngestLicenseMonitorOptions = {
  check: (signal: AbortSignal) => Promise<void>;
  windowTarget: {
    addEventListener: (type: "focus", listener: () => void) => void;
    removeEventListener: (type: "focus", listener: () => void) => void;
  };
  documentTarget: {
    visibilityState: string;
    addEventListener: (type: "visibilitychange", listener: () => void) => void;
    removeEventListener: (type: "visibilitychange", listener: () => void) => void;
  };
  setIntervalFn: (handler: () => void, intervalMs: number) => number;
  clearIntervalFn: (intervalId: number) => void;
  intervalMs?: number;
};

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(source: UnknownRecord | null, key: string) {
  const value = source?.[key];

  return typeof value === "string" ? value.trim() : "";
}

function normalizeInvalidCode(value: string): IngestLicenseInvalidCode | null {
  return value === "LICENSE_DISABLED" || value === "LICENSE_EXPIRED" ? value : null;
}

function getPayloadSources(payload: unknown) {
  const root = isRecord(payload) ? payload : null;
  const data = root && isRecord(root.data) ? root.data : root;
  const license = data && isRecord(data.license) ? data.license : null;

  return { data, license };
}

function readExplicitInvalidCode(payload: unknown) {
  return normalizeInvalidCode(readApiErrorCode(payload) ?? "");
}

function normalizeLicenseStatus(value: string) {
  return value.trim().toLowerCase();
}

function isLicenseStatusPath(pathname: string | null) {
  return pathname === "/api/ingest/auth/me";
}

function isObservedIngestBusinessPath(pathname: string | null) {
  return Boolean(
    pathname?.startsWith("/api/admin/") ||
    pathname?.startsWith("/api/runtime/memory/")
  );
}

export function readIngestLicenseSignal(input: {
  responseStatus: number;
  requestPath: string | null;
  payload: unknown;
}): IngestLicenseSignal {
  const explicitCode = readExplicitInvalidCode(input.payload);

  if (input.responseStatus === 403 && explicitCode) {
    return explicitCode;
  }

  if (!isLicenseStatusPath(input.requestPath) || input.responseStatus < 200 || input.responseStatus >= 300) {
    return null;
  }

  if (explicitCode) {
    return explicitCode;
  }

  const { data, license } = getPayloadSources(input.payload);
  const rawStatus = readString(license, "status") || readString(data, "status");
  const status = normalizeLicenseStatus(rawStatus);

  if (status === "disabled") {
    return "LICENSE_DISABLED";
  }

  if (status === "expired") {
    return "LICENSE_EXPIRED";
  }

  return null;
}

function getRequestUrl(input: RequestInfo | URL, baseOrigin: string) {
  const value = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;

  try {
    const url = new URL(value, baseOrigin);

    if (url.origin !== new URL(baseOrigin).origin) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

function getRequestMethod(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) {
    return init.method.toUpperCase();
  }

  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.method.toUpperCase();
  }

  return "GET";
}

export function isBlockedIngestBusinessRequest(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  baseOrigin: string
) {
  const url = getRequestUrl(input, baseOrigin);

  if (!url) {
    return false;
  }

  const method = getRequestMethod(input, init);

  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return false;
  }

  return url.pathname.startsWith("/api/admin/") || url.pathname.startsWith("/api/runtime/memory/");
}

function createBlockedResponse(code: IngestLicenseInvalidCode) {
  const message = "卡密已失效，投喂端功能已暂停。";

  return new Response(JSON.stringify({
    ok: false,
    success: false,
    code,
    message,
    error: {
      code,
      message
    }
  }), {
    status: 403,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

export function createIngestLicenseGuardedFetch(options: GuardedFetchOptions): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (options.isEnabled?.() === false) {
      return options.fetch(input, init);
    }

    const invalidCode = options.getInvalidCode();

    if (invalidCode && isBlockedIngestBusinessRequest(input, init, options.baseOrigin)) {
      return createBlockedResponse(invalidCode);
    }

    const response = await options.fetch(input, init);
    const requestUrl = getRequestUrl(input, options.baseOrigin);
    const requestPath = requestUrl?.pathname ?? null;
    const shouldInspect = Boolean(requestUrl) && (
      isLicenseStatusPath(requestPath) ||
      (response.status === 403 && isObservedIngestBusinessPath(requestPath))
    );

    if (shouldInspect) {
      const payload = await response.clone().json().catch(() => null);
      const signal = readIngestLicenseSignal({
        responseStatus: response.status,
        requestPath,
        payload
      });

      if (signal) {
        options.onInvalid(signal);
      }
    }

    return response;
  }) as typeof fetch;
}

export function startIngestLicenseStatusMonitor(options: IngestLicenseMonitorOptions) {
  let stopped = false;
  let checking = false;
  let controller: AbortController | null = null;

  const runCheck = () => {
    if (stopped || checking) {
      return;
    }

    checking = true;
    controller = new AbortController();
    const currentController = controller;

    void options.check(currentController.signal)
      .catch(() => undefined)
      .finally(() => {
        if (controller === currentController) {
          controller = null;
        }
        checking = false;
      });
  };
  const handleFocus = () => {
    runCheck();
  };
  const handleVisibilityChange = () => {
    if (options.documentTarget.visibilityState === "visible") {
      runCheck();
    }
  };

  options.windowTarget.addEventListener("focus", handleFocus);
  options.documentTarget.addEventListener("visibilitychange", handleVisibilityChange);
  const intervalId = options.setIntervalFn(
    runCheck,
    options.intervalMs ?? INGEST_LICENSE_CHECK_INTERVAL_MS
  );
  runCheck();

  return () => {
    stopped = true;
    controller?.abort();
    options.clearIntervalFn(intervalId);
    options.windowTarget.removeEventListener("focus", handleFocus);
    options.documentTarget.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}
