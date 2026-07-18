import "server-only";

import { cookies } from "next/headers";
import { getUserRoles } from "@/lib/auth/rbac";
import type { AppUser } from "@/lib/auth";
import {
  createIngestPortalCookieValue,
  getIngestPortalCookieOptions,
  INGEST_PORTAL_COOKIE_NAME
} from "@/lib/enterprise/ingest-portal-cookie";

function canUseIngestPortal(roles: string[], licenseActivated: boolean) {
  return roles.includes("super_admin") || (licenseActivated && (roles.includes("kb_admin") || roles.includes("ingest_admin")));
}

export async function setIngestPortalCookie(user: Pick<AppUser, "id" | "phone" | "licenseActivated">, request?: Request) {
  const roles = await getUserRoles(user);
  const licenseActivated = canUseIngestPortal(roles, user.licenseActivated);
  const expiresAt = new Date(Date.now() + 60 * 60 * 24 * 30 * 1000);
  const value = await createIngestPortalCookieValue({
    userId: user.id,
    licenseActivated,
    expiresAt
  });

  cookies().set(INGEST_PORTAL_COOKIE_NAME, value, getIngestPortalCookieOptions(request, expiresAt));
}

export async function toIngestAuthUser(user: AppUser) {
  const roles = await getUserRoles(user);

  return {
    id: user.id,
    phone: user.phone,
    name: user.name,
    isActive: user.isActive,
    licenseActivated: canUseIngestPortal(roles, user.licenseActivated),
    isSuperAdmin: roles.includes("super_admin"),
    roles
  };
}
