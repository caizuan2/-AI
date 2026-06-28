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

function readMetadataAppType(metadata: unknown): NormalizedProductAccess {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as { appType?: unknown; product?: unknown; cardType?: unknown; licenseType?: unknown }).appType ??
    (metadata as { product?: unknown }).product ??
    (metadata as { cardType?: unknown }).cardType ??
    (metadata as { licenseType?: unknown }).licenseType;

  return normalizeProductAccess(value);
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
    subject.appType
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

function getPermissionSignals(subject: AccessSubject) {
  return readValues(subject.permissions);
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

function inferAccessFromRoles(roles: readonly AppRole[], baseRole: AppRole | null, licenseActivated: boolean): NormalizedProductAccess {
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

  return licenseActivated ? "user_app" : null;
}

async function getLatestLicenseType(userId: string): Promise<NormalizedProductAccess> {
  const license = await prisma.licenseKey.findFirst({
    where: {
      redeemedByUserId: userId,
      status: LicenseKeyStatus.USED
    },
    orderBy: [
      { redeemedAt: "desc" },
      { createdAt: "desc" }
    ],
    select: {
      id: true
    }
  });

  if (!license) {
    return null;
  }

  const auditLog = await prisma.auditLog.findFirst({
    where: {
      targetType: "license_key",
      targetId: license.id
    },
    orderBy: {
      createdAt: "desc"
    },
    select: {
      metadata: true
    }
  });

  return readMetadataAppType(auditLog?.metadata);
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
  const [roles, baseRole, licenseAccess] = await Promise.all([
    getUserRoles(user),
    getBaseRole(user.id),
    getLatestLicenseType(user.id)
  ]);
  const role = getHighestRole(roles);
  const inferredAccess = licenseAccess ?? inferAccessFromRoles(roles, baseRole, Boolean(user.licenseActivated));
  const externalLicenseType = toExternalLicenseType(inferredAccess);

  return {
    id: user.id,
    role,
    roles,
    baseRole,
    licenseActivated: user.licenseActivated || roles.includes("super_admin"),
    licenseType: externalLicenseType,
    productType: externalLicenseType,
    cardType: externalLicenseType,
    appType: externalLicenseType,
    permissions: roles
  };
}

export function hasUserClientAccess(profile: AccessSubject | null | undefined) {
  if (!profile || !isLicenseActivated(profile.licenseActivated)) {
    return false;
  }

  const productSignals = getProductSignals(profile);
  const roleSignals = getRoleSignals(profile);

  if (hasSignal(productSignals, "user_app", userClientTokens)) {
    return true;
  }

  if (hasSignal(productSignals, "ingest_admin", ingestTokens) || hasSignal(productSignals, "super_admin", superAdminTokens)) {
    return hasSignal(getPermissionSignals(profile), "user_app", userClientTokens);
  }

  return hasSignal(roleSignals, "user_app", userClientTokens);
}

export function hasIngestAccess(profile: AccessSubject | null | undefined) {
  if (!profile) {
    return false;
  }

  if (hasSuperAdminSignal(profile)) {
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

  if (hasUserClientAccess(profile)) {
    return "user";
  }

  if (hasIngestAccess(profile)) {
    return "admin-feed";
  }

  return "user";
}

export function getEntryPathFromAccessProfile(profile: UserAccessProfile) {
  return getEntryPathForRole(getEntryRoleFromAccessProfile(profile), profile.licenseActivated);
}
