export type ProductAccess = "user_app" | "ingest_admin" | "super_admin" | "public";

export const PRODUCT_ACCESS_HEADER = "x-aikb-product";

const userAppPagePrefixes = ["/chat-ui", "/user"];
const userAppApiPrefixes = ["/api/auth", "/api/user", "/api/chat"];
const ingestPagePrefixes = ["/ingest", "/admin-ingest"];
const ingestApiPrefixes = ["/api/ingest", "/api/admin/ingest", "/api/admin/kb/ingest", "/api/core/ingest"];
const superAdminPagePrefixes = ["/super-admin"];
const superAdminApiPrefixes = ["/api/super-admin"];

function isPathUnder(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function getProductFromPath(pathname: string): ProductAccess {
  if (isPathUnder(pathname, superAdminPagePrefixes) || isPathUnder(pathname, superAdminApiPrefixes)) {
    return "super_admin";
  }

  if (isPathUnder(pathname, ingestPagePrefixes) || isPathUnder(pathname, ingestApiPrefixes)) {
    return "ingest_admin";
  }

  if (
    isPathUnder(pathname, userAppPagePrefixes) ||
    isPathUnder(pathname, userAppApiPrefixes) ||
    pathname === "/api/license/redeem" ||
    pathname === "/api/activate"
  ) {
    return "user_app";
  }

  return "public";
}

export function isProductApiPath(pathname: string) {
  return pathname.startsWith("/api/") && getProductFromPath(pathname) !== "public";
}

export function isProductAccess(value: unknown): value is ProductAccess {
  return value === "user_app" || value === "ingest_admin" || value === "super_admin" || value === "public";
}

export function getRequiredLicenseAppTypeForProduct(product: ProductAccess) {
  if (product === "user_app") {
    return "user_app" as const;
  }

  if (product === "ingest_admin") {
    return "ingest_admin" as const;
  }

  return null;
}

export function roleCanAccessProduct(product: ProductAccess, role: string | null | undefined) {
  if (product === "public") {
    return true;
  }

  if (product === "user_app") {
    return role === "user";
  }

  if (product === "ingest_admin") {
    return role === "ingest_admin" || role === "kb_admin" || role === "super_admin";
  }

  if (product === "super_admin") {
    return role === "super_admin";
  }

  return false;
}
