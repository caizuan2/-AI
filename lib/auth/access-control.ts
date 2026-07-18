import "server-only";

import { LicenseKeyStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserRoles } from "@/lib/auth/rbac";
import { type AppUser } from "@/lib/auth/session";
import { getEntryPathForRole, type EntryRole } from "@/lib/auth/product";
import {
  getHighestRole,
  normalizeAppRole,
  type AppRole
} from "@/lib/rbac/roles";

export type NormalizedProductAccess = "user_app" | "ingest_admin" | "super_admin" | null;

type RedeemedLicenseProduct = Exclude<NormalizedProductAccess, null> | "team_os";

const AUTHORITATIVE_LICENSE_AUDIT_ACTIONS = [
  "generate_user_app_license_key",
  "generate_ingest_admin_license_key",
  "generate_team_os_license_key",
  "generate_super_admin_license_key",
  "redeem_license_key",
  "redeem_team_os_license_key",
  "renew_license_key",
  "disable_license_key",
  "SUPER_ADMIN_LICENSE_GENERATE",
  "SUPER_ADMIN_LICENSE_DISABLE"
] as const;

export interface UserAccessProfile {
  id: string;
  role: AppRole;
  roles: AppRole[];
  baseRole: AppRole | null;
  licenseActivated: boolean;
  licenseType: string | null;
  productType: string | null;
  cardType: string | null;
  appType: string | null;
  productAccesses: NormalizedProductAccess[];
  permissions: string[];
}

export interface AccessSubject {
  role?: unknown;
  roles?: readonly unknown[];
  baseRole?: unknown;
  licenseActivated?: unknown;
  licenseType?: unknown;
  productType?: unknown;
  cardType?: unknown;
  appType?: unknown;
  productAccesses?: readonly unknown[];
  permissions?: readonly unknown[];
}

const userClientTokens = new Set([
  "aikb",
  "client",
  "customer",
  "knowledge-user",
  "user",
  "user-app",
  "user-client",
  "xt-user"
]);

const ingestTokens = new Set([
  "admin",
  "admin-feed",
  "admin-ingest",
  "enterprise-admin",
  "ingest",
  "ingest-admin",
  "kb-admin",
  "xt-ingest"
]);

const superAdminTokens = new Set([
  "super",
  "super-admin",
  "xt-super"
]);

function normalizeAccessToken(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-");
}

export function normalizeAccessValue(value: unknown) {
  return normalizeAccessToken(value);
}

function normalizeCanonicalLicenseProduct(value: unknown): RedeemedLicenseProduct | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "user_app" || normalized === "ingest_admin" || normalized === "super_admin") {
    return normalized;
  }
  if (normalized === "team_os") {
    return "team_os";
  }
  return null;
}

function productFromGenerationAction(action: string): RedeemedLicenseProduct | null {
  if (action === "generate_user_app_license_key") return "user_app";
  if (action === "generate_ingest_admin_license_key") return "ingest_admin";
  if (action === "generate_team_os_license_key") return "team_os";
  if (action === "generate_super_admin_license_key") return "super_admin";
  return null;
}

function readMetadataAppType(action: string, metadata: unknown): RedeemedLicenseProduct | null {
  const generatedProduct = productFromGenerationAction(action);
  if (generatedProduct) {
    return generatedProduct;
  }

  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const canonicalAppType = normalizeCanonicalLicenseProduct(
    (metadata as { appType?: unknown }).appType
  );
  if (canonicalAppType) {
    return canonicalAppType;
  }

  return action === "redeem_license_key"
    ? normalizeCanonicalLicenseProduct((metadata as { licenseAppType?: unknown }).licenseAppType)
    : null;
}

function toExternalLicenseType(value: NormalizedProductAccess) {
  if (value === "user_app") {
    return "XT-USER";
  }

  if (value === "ingest_admin") {
    return "XT-INGEST";
  }

  if (value === "super_admin") {
    return "XT-SUPER";
  }

  return null;
}

export function normalizeRole(value: unknown) {
  return normalizeAccessValue(value);
}

export function normalizeProduct(value: unknown) {
  return normalizeAccessValue(value);
}

export function normalizeProductAccess(value: unknown): NormalizedProductAccess {
  const normalized = normalizeAccessValue(value);

  if (userClientTokens.has(normalized) || normalized === "userapp") {
    return "user_app";
  }

  if (ingestTokens.has(normalized) || normalized === "ingestadmin") {
    return "ingest_admin";
  }

  if (superAdminTokens.has(normalized) || normalized === "superadmin") {
    return "super_admin";
  }

  return null;
}

export function isUserAppPath(pathname: string) {
  return pathname === "/app" ||
    pathname.startsWith("/app/") ||
    pathname === "/chat-ui" ||
    pathname.startsWith("/chat-ui/") ||
    pathname === "/user" ||
    pathname.startsWith("/user/") ||
    pathname === "/api/user" ||
    pathname.startsWith("/api/user/") ||
    pathname === "/api/chat" ||
    pathname.startsWith("/api/chat/") ||
    pathname === "/api/ai/chat" ||
    pathname.startsWith("/api/ai/chat/");
}

export function isIngestPath(pathname: string) {
  return pathname === "/ingest" ||
    pathname.startsWith("/ingest/") ||
    pathname === "/admin-ingest" ||
    pathname.startsWith("/admin-ingest/") ||
    pathname === "/api/ingest" ||
    pathname.startsWith("/api/ingest/") ||
    pathname === "/api/admin/kb" ||
    pathname.startsWith("/api/admin/kb/") ||
    pathname === "/api/admin/ingest" ||
    pathname.startsWith("/api/admin/ingest/") ||
    pathname === "/api/core/ingest" ||
    pathname.startsWith("/api/core/ingest/");
}

export function isPublicPath(pathname: string) {
  return pathname === "/" ||
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/unlock" ||
    pathname === "/no-access" ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/public/") ||
    pathname.startsWith("/uploads/") ||
    pathname.startsWith("/api/public/") ||
    pathname === "/api/health";
}

function readValues(values: readonly unknown[] | undefined) {
  return Array.isArray(values) ? values : [];
}

function getProductSignals(subject: AccessSubject) {
  return [
    subject.licenseType,
    subject.productType,
    subject.cardType,
    subject.appType,
    ...readValues(subject.productAccesses)
  ];
}

function getRoleSignals(subject: AccessSubject) {
  return [
    subject.role,
    subject.baseRole,
    ...readValues(subject.roles),
    ...readValues(subject.permissions)
  ];
}

function hasSignal(values: readonly unknown[], access: Exclude<NormalizedProductAccess, null>, tokens: Set<string>) {
  return values.some((value) => normalizeProductAccess(value) === access || tokens.has(normalizeAccessValue(value)));
}

function hasSuperAdminSignal(subject: AccessSubject) {
  return hasSignal([...getProductSignals(subject), ...getRoleSignals(subject)], "super_admin", superAdminTokens);
}

function isLicenseActivated(value: unknown) {
  return value === true || value === "true" || value === 1;
}

function inferAccessFromRoles(roles: readonly AppRole[], baseRole: AppRole | null): NormalizedProductAccess {
  if (roles.includes("super_admin") || baseRole === "super_admin") {
    return "super_admin";
  }

  if (
    roles.includes("kb_admin") ||
    roles.includes("ingest_admin") ||
    roles.includes("enterprise_admin") ||
    baseRole === "kb_admin" ||
    baseRole === "ingest_admin" ||
    baseRole === "enterprise_admin"
  ) {
    return "ingest_admin";
  }

  return null;
}

function isLegacyActivatedUserApp(
  user: Pick<AppUser, "licenseActivated">,
  roles: readonly AppRole[],
  baseRole: AppRole | null,
  inferredAccess: NormalizedProductAccess
) {
  if (!isLicenseActivated(user.licenseActivated) || inferredAccess !== null) {
    return false;
  }

  const roleSignals = [baseRole, ...roles].filter((value): value is AppRole => Boolean(value));

  if (
    hasSignal(roleSignals, "ingest_admin", ingestTokens) ||
    hasSignal(roleSignals, "super_admin", superAdminTokens)
  ) {
    return false;
  }

  return roleSignals.some((value) => normalizeAccessValue(value) === "user");
}

async function getRedeemedLicenseAccess(userId: string) {
  const licenses = await prisma.licenseKey.findMany({
    where: {
      redeemedByUserId: userId,
      status: LicenseKeyStatus.USED
    },
    orderBy: [
      { redeemedAt: "desc" },
      { createdAt: "desc" }
    ],
    select: { id: true }
  });

  if (licenses.length === 0) {
    return {
      primary: null as NormalizedProductAccess,
      products: [] as NormalizedProductAccess[]
    };
  }

  const auditLogs = await prisma.auditLog.findMany({
    where: {
      targetType: "license_key",
      targetId: { in: licenses.map((license) => license.id) },
      action: { in: [...AUTHORITATIVE_LICENSE_AUDIT_ACTIONS] }
    },
    orderBy: {
      createdAt: "desc"
    },
    select: {
      targetId: true,
      action: true,
      metadata: true
    }
  });

  const accessByLicenseId = new Map<string, RedeemedLicenseProduct>();
  for (const auditLog of auditLogs) {
    if (!auditLog.targetId || accessByLicenseId.has(auditLog.targetId)) {
      continue;
    }
    const appType = readMetadataAppType(auditLog.action, auditLog.metadata);

    if (appType) {
      accessByLicenseId.set(auditLog.targetId, appType);
    }
  }

  const orderedProducts = licenses.flatMap((license) => {
    const product = accessByLicenseId.get(license.id);

    if (product === "team_os") {
      return [];
    }
    if (product) {
      return [product];
    }
    return [];
  });
  const products = Array.from(new Set(orderedProducts));

  return {
    primary: orderedProducts[0] ?? null,
    products
  };
}

async function getBaseRole(userId: string) {
  const user = await prisma.user.findUnique({
    where: {
      id: userId
    },
    select: {
      role: true
    }
  });

  return normalizeAppRole(user?.role);
}

export async function getUserAccessProfile(user: Pick<AppUser, "id" | "phone" | "licenseActivated">): Promise<UserAccessProfile> {
  const [roles, baseRole, redeemedAccess] = await Promise.all([
    getUserRoles(user),
    getBaseRole(user.id),
    getRedeemedLicenseAccess(user.id)
  ]);
  const role = getHighestRole(roles);
  const roleInferredAccess = inferAccessFromRoles(roles, baseRole);
  const legacyUserAppAccess = isLegacyActivatedUserApp(user, roles, baseRole, roleInferredAccess);
  const inferredAccess = redeemedAccess.primary ?? roleInferredAccess ?? (legacyUserAppAccess ? "user_app" : null);
  const externalLicenseType = toExternalLicenseType(inferredAccess);
  const hasRedeemedProductLicense = redeemedAccess.products.length > 0;

  return {
    id: user.id,
    role,
    roles,
    baseRole,
    licenseActivated: user.licenseActivated || hasRedeemedProductLicense || roles.includes("super_admin"),
    licenseType: externalLicenseType,
    productType: externalLicenseType,
    cardType: externalLicenseType,
    appType: externalLicenseType,
    productAccesses: redeemedAccess.products,
    permissions: roles
  };
}

export function hasUserClientAccess(profile: AccessSubject | null | undefined) {
  if (!profile || !isLicenseActivated(profile.licenseActivated)) {
    return false;
  }

  if (readValues(profile.productAccesses).some((value) => normalizeProductAccess(value) === "user_app")) {
    return true;
  }

  const productSignals = getProductSignals(profile);
  const roleSignals = getRoleSignals(profile);
  const hasIngestProduct = hasSignal(productSignals, "ingest_admin", ingestTokens);
  const hasSuperAdminProduct = hasSignal(productSignals, "super_admin", superAdminTokens);

  if (hasIngestProduct || hasSuperAdminProduct) {
    return false;
  }

  if (hasSignal(roleSignals, "ingest_admin", ingestTokens) || hasSuperAdminSignal(profile)) {
    return false;
  }

  if (hasSignal(productSignals, "user_app", userClientTokens)) {
    return true;
  }

  return roleSignals.some((value) => {
    const token = normalizeAccessValue(value);

    return token === "user-app" || token === "user-client" || token === "xt-user" || token === "knowledge-user";
  });
}

export function hasIngestAccess(profile: AccessSubject | null | undefined) {
  if (!profile) {
    return false;
  }

  if (hasSuperAdminSignal(profile)) {
    return true;
  }

  if (readValues(profile.productAccesses).some((value) => normalizeProductAccess(value) === "ingest_admin")) {
    return true;
  }

  const productSignals = getProductSignals(profile);
  const roleSignals = getRoleSignals(profile);

  if (hasSignal(productSignals, "user_app", userClientTokens)) {
    return false;
  }

  return hasSignal(productSignals, "ingest_admin", ingestTokens) || hasSignal(roleSignals, "ingest_admin", ingestTokens);
}

export function canAccessPath(user: AccessSubject | null | undefined, pathname: string) {
  const normalizedPath = pathname.split("?")[0] || "/";

  if (isPublicPath(normalizedPath)) {
    return true;
  }

  if (isUserAppPath(normalizedPath)) {
    return hasUserClientAccess(user);
  }

  if (isIngestPath(normalizedPath)) {
    return hasIngestAccess(user);
  }

  if (normalizedPath === "/super-admin" || normalizedPath.startsWith("/super-admin/")) {
    return Boolean(user && hasSuperAdminSignal(user));
  }

  return true;
}

export function getEntryRoleFromAccessProfile(profile: UserAccessProfile): EntryRole {
  if (profile.roles.includes("super_admin") || profile.role === "super_admin") {
    return "super-admin";
  }

  if (hasIngestAccess(profile)) {
    return "admin-feed";
  }

  if (hasUserClientAccess(profile)) {
    return "user";
  }

  return "user";
}

export function getEntryPathFromAccessProfile(profile: UserAccessProfile) {
  if (getEntryRoleFromAccessProfile(profile) === "user" && !hasUserClientAccess(profile)) {
    return "/unlock";
  }

  return getEntryPathForRole(getEntryRoleFromAccessProfile(profile), profile.licenseActivated);
}
