export type LicenseReactivationAppType = "user_app" | "ingest_admin";
export type LicenseReactivationReason = "disabled" | "expired" | "missing" | "mismatch";

export const LICENSE_REACTIVATION_EVENT_KEY = "aikb_license_reactivated";

function isSafeInternalPath(value: string) {
  return value.startsWith("/") && !value.startsWith("//");
}

export function isIngestProductPath(value: string) {
  const pathname = value.split("?")[0] ?? value;

  return (
    pathname === "/ingest" ||
    pathname.startsWith("/ingest/") ||
    pathname === "/admin-ingest" ||
    pathname.startsWith("/admin-ingest/")
  );
}

export function normalizeLicenseReactivationAppType(value: unknown): LicenseReactivationAppType {
  if (typeof value !== "string") {
    return "user_app";
  }

  const normalized = value.trim().toLowerCase();

  return normalized === "admin" ||
    normalized === "ingest" ||
    normalized === "admin_ingest" ||
    normalized === "ingest_admin"
    ? "ingest_admin"
    : "user_app";
}

export function normalizeLicenseReactivationReason(value: unknown): LicenseReactivationReason | null {
  return value === "disabled" || value === "expired" || value === "missing" || value === "mismatch"
    ? value
    : null;
}

export function getLicenseReactivationTarget(appType: LicenseReactivationAppType, requestedPath?: string) {
  if (requestedPath && isSafeInternalPath(requestedPath)) {
    if (appType === "ingest_admin" && isIngestProductPath(requestedPath)) {
      return requestedPath;
    }

    if (appType === "user_app" && !isIngestProductPath(requestedPath)) {
      return requestedPath;
    }
  }

  return appType === "ingest_admin" ? "/ingest" : "/";
}

export function getLicenseReactivationUrl(
  appType: LicenseReactivationAppType,
  requestedPath?: string,
  reason?: LicenseReactivationReason | null
) {
  const params = new URLSearchParams({
    app: appType,
    next: getLicenseReactivationTarget(appType, requestedPath)
  });

  if (reason) {
    params.set("reason", reason);
  }

  return `/unlock?${params.toString()}`;
}

export function getPostLoginDestination(input: {
  nextPath?: string;
  licenseActivated?: boolean;
  isSuperAdmin?: boolean;
}) {
  if (input.nextPath) {
    if (!input.licenseActivated && isIngestProductPath(input.nextPath)) {
      return getLicenseReactivationUrl("ingest_admin", input.nextPath, "missing");
    }

    return input.nextPath;
  }

  if (input.isSuperAdmin) {
    return "/super-admin";
  }

  return input.licenseActivated ? "/ingest" : "/unlock";
}

export function maskAccountPhone(phone: string) {
  const normalized = phone.trim();

  if (normalized.length < 7) {
    return normalized.replace(/.(?=.{2})/g, "*");
  }

  return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
}

export function getHistoryScopeForUser(userId: string) {
  return userId;
}
