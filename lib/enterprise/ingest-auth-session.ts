import "server-only";

import { cookies } from "next/headers";
import type { AppUser } from "@/lib/auth";
import {
  resolveIngestAccessTier,
  type IngestAccessResolution
} from "@/lib/enterprise/ingest-access-tier";
import {
  createIngestPortalCookieValue,
  getIngestPortalCookieOptions,
  INGEST_PORTAL_COOKIE_NAME
} from "@/lib/enterprise/ingest-portal-cookie";

export async function setIngestPortalCookie(
  user: Pick<AppUser, "id" | "phone" | "isActive" | "licenseActivated">,
  request?: Request,
  access?: IngestAccessResolution
) {
  const resolution = access ?? await resolveIngestAccessTier(user);
  const expiresAt = new Date(Date.now() + 60 * 60 * 24 * 30 * 1000);
  const value = await createIngestPortalCookieValue({
    userId: user.id,
    licenseActivated: resolution.capabilities.enterPortal,
    expiresAt
  });

  cookies().set(INGEST_PORTAL_COOKIE_NAME, value, getIngestPortalCookieOptions(request, expiresAt));
}

export async function toIngestAuthUser(user: AppUser, access?: IngestAccessResolution) {
  const resolution = access ?? await resolveIngestAccessTier(user);

  return {
    id: user.id,
    phone: user.phone,
    name: user.name,
    isActive: user.isActive,
    licenseActivated: resolution.capabilities.enterPortal,
    hasIngestPortalAccess: resolution.capabilities.enterPortal,
    hasIngestAccess: resolution.accessTier === "full_ingest",
    accessTier: resolution.accessTier,
    capabilities: resolution.capabilities,
    isSuperAdmin: resolution.roles.includes("super_admin"),
    roles: resolution.roles
  };
}
