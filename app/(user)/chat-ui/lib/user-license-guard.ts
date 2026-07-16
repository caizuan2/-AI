import { ApiClientError, unwrapApiResponse } from "@/lib/api/client";

export const USER_LICENSE_STATUS_URL = "/api/license/status";
export const USER_LICENSE_CHECK_INTERVAL_MS = 60_000;

export type UserLicenseInvalidReason = "disabled" | "expired";

export type UserLicenseGuardSnapshot =
  | {
      invalid: false;
      reason: null;
    }
  | {
      invalid: true;
      reason: UserLicenseInvalidReason;
    };

export interface UserLicenseGuardStore {
  getSnapshot: () => UserLicenseGuardSnapshot;
  subscribe: (listener: () => void) => () => void;
  markInvalid: (reason: UserLicenseInvalidReason) => boolean;
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const ACTIVE_SNAPSHOT: UserLicenseGuardSnapshot = Object.freeze({
  invalid: false,
  reason: null
});

const guardedRequestAllowlist = new Set([
  "/api/activate",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/license/activate",
  "/api/license/redeem",
  "/api/license/status",
  "/api/license/verify"
]);

function toInvalidReason(code: unknown): UserLicenseInvalidReason | null {
  if (code === "LICENSE_DISABLED") {
    return "disabled";
  }

  if (code === "LICENSE_EXPIRED") {
    return "expired";
  }

  return null;
}

function readRequestPathname(input: RequestInfo | URL) {
  const rawUrl = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;

  try {
    return new URL(rawUrl, "http://localhost").pathname;
  } catch {
    return null;
  }
}

function readStatusValue(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const root = payload as Record<string, unknown>;
  const data = root.data && typeof root.data === "object" && !Array.isArray(root.data)
    ? root.data as Record<string, unknown>
    : root;
  const license = data.license && typeof data.license === "object" && !Array.isArray(data.license)
    ? data.license as Record<string, unknown>
    : data;

  return typeof license.status === "string" ? license.status.toLowerCase() : null;
}

export function createUserLicenseGuardStore(): UserLicenseGuardStore {
  let snapshot = ACTIVE_SNAPSHOT;
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    markInvalid(reason) {
      if (snapshot.invalid) {
        return false;
      }

      snapshot = Object.freeze({
        invalid: true,
        reason
      });
      listeners.forEach((listener) => listener());
      return true;
    }
  };
}

export async function readInvalidLicenseResponse(response: Response) {
  if (response.status !== 403) {
    return null;
  }

  try {
    await unwrapApiResponse<unknown>(response.clone(), "授权状态校验失败。");
  } catch (error) {
    if (error instanceof ApiClientError) {
      return toInvalidReason(error.details.code);
    }
  }

  return null;
}

export async function readInvalidLicenseStatus(response: Response) {
  const responseReason = await readInvalidLicenseResponse(response);

  if (responseReason || !response.ok) {
    return responseReason;
  }

  try {
    const payload = await response.clone().json() as unknown;
    const status = readStatusValue(payload);

    return status === "disabled" || status === "expired" ? status : null;
  } catch {
    return null;
  }
}

export function shouldBlockUserBusinessRequest(
  input: RequestInfo | URL,
  snapshot: UserLicenseGuardSnapshot
) {
  if (!snapshot.invalid) {
    return false;
  }

  const pathname = readRequestPathname(input);

  return Boolean(
    pathname?.startsWith("/api/") &&
    !guardedRequestAllowlist.has(pathname)
  );
}

export class UserLicenseAccessBlockedError extends Error {
  constructor() {
    super("卡密已失效，当前功能已暂停。");
    this.name = "UserLicenseAccessBlockedError";
  }
}

export function createUserLicenseAwareFetch(
  baseFetch: FetchLike,
  store: UserLicenseGuardStore
): FetchLike {
  return async (input, init) => {
    if (shouldBlockUserBusinessRequest(input, store.getSnapshot())) {
      throw new UserLicenseAccessBlockedError();
    }

    const response = await baseFetch(input, init);
    const reason = await readInvalidLicenseResponse(response);

    if (reason) {
      store.markInvalid(reason);
    }

    return response;
  };
}

export async function checkCurrentUserLicense(
  fetchRequest: FetchLike,
  store: UserLicenseGuardStore
) {
  if (store.getSnapshot().invalid) {
    return;
  }

  try {
    const response = await fetchRequest(USER_LICENSE_STATUS_URL, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: {
        Accept: "application/json"
      }
    });

    if (store.getSnapshot().invalid) {
      return;
    }

    const reason = await readInvalidLicenseStatus(response);

    if (reason) {
      store.markInvalid(reason);
    }
  } catch {
    // Network failures must not be treated as an invalid license.
  }
}
