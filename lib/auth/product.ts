export type AppProduct = "user_app" | "ingest_admin" | "super_admin" | "public";
export type EntryRole = "user" | "admin-feed" | "super-admin";

function isPathUnder(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function matchesAny(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => isPathUnder(pathname, prefix));
}

const superAdminPrefixes = [
  "/super-admin",
  "/api/super-admin"
];

const ingestAdminPrefixes = [
  "/ingest",
  "/admin-ingest",
  "/api/ingest",
  "/api/admin/ingest",
  "/api/admin/kb",
  "/api/core/ingest"
];

const userAppPrefixes = [
  "/app",
  "/chat",
  "/chat-ui",
  "/user",
  "/unlock",
  "/api/user",
  "/api/chat",
  "/api/auth",
  "/api/license/redeem",
  "/api/activate"
];

export function getProductFromPath(pathname: string): AppProduct {
  if (matchesAny(pathname, superAdminPrefixes)) {
    return "super_admin";
  }

  if (matchesAny(pathname, ingestAdminPrefixes)) {
    return "ingest_admin";
  }

  if (matchesAny(pathname, userAppPrefixes)) {
    return "user_app";
  }

  return "public";
}

export function getLicenseAppTypeForProduct(product: AppProduct) {
  if (product === "user_app" || product === "ingest_admin" || product === "super_admin") {
    return product;
  }

  return null;
}

export function getEntryRoleFromRoles(input: {
  roles?: string[];
  isSuperAdmin?: boolean;
}): EntryRole {
  const roles = new Set(input.roles ?? []);

  if (input.isSuperAdmin || roles.has("super_admin")) {
    return "super-admin";
  }

  if (roles.has("ingest_admin") || roles.has("kb_admin") || roles.has("enterprise_admin")) {
    return "admin-feed";
  }

  return "user";
}

export function getEntryPathForRole(role: EntryRole, licenseActivated = false) {
  if (role === "super-admin") {
    return "/super-admin";
  }

  if (role === "admin-feed") {
    return "/ingest";
  }

  return licenseActivated ? "/app" : "/unlock";
}

export function getEntryPathFromRoles(input: {
  roles?: string[];
  isSuperAdmin?: boolean;
  licenseActivated?: boolean;
}) {
  return getEntryPathForRole(
    getEntryRoleFromRoles(input),
    Boolean(input.licenseActivated)
  );
}

export function isPathAllowedForEntryRole(pathname: string, role: EntryRole) {
  const normalizedPath = pathname.split("?")[0] || pathname;
  const product = getProductFromPath(normalizedPath);

  if (product === "public") {
    return true;
  }

  if (role === "super-admin") {
    return product === "super_admin" || product === "ingest_admin";
  }

  if (role === "admin-feed") {
    return product === "ingest_admin";
  }

  return product === "user_app";
}
