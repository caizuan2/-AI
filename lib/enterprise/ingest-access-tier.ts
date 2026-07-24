import "server-only";

import type { AppUser } from "@/lib/auth";
import {
  checkUserLicense,
  hasRedeemedLicenseForAppType
} from "@/lib/auth/license";
import { getUserRoles } from "@/lib/auth/rbac";
import { toAppError } from "@/lib/errors";
import {
  capabilitiesForIngestTier,
  resolveIngestAccessTierFromFacts,
  type IngestAccessTier,
  type IngestCapabilities
} from "@/lib/enterprise/ingest-access-policy";
import type { AppRole } from "@/lib/rbac/roles";

export type { IngestAccessTier, IngestCapabilities } from "@/lib/enterprise/ingest-access-policy";

export type IngestAccessResolution = {
  accessTier: IngestAccessTier;
  capabilities: IngestCapabilities;
  roles: AppRole[];
  invalidLicenseCode: "LICENSE_DISABLED" | "LICENSE_EXPIRED" | null;
};

async function readInvalidLicenseCode(
  userId: string,
  requiredAppType: "user_app" | "ingest_admin"
) {
  try {
    await checkUserLicense(userId, requiredAppType);
    return null;
  } catch (error) {
    const appError = toAppError(error);

    if (appError.statusCode >= 500) {
      throw error;
    }

    return appError.code === "LICENSE_DISABLED" || appError.code === "LICENSE_EXPIRED"
      ? appError.code
      : null;
  }
}

export async function resolveIngestAccessTier(
  user: Pick<AppUser, "id" | "phone" | "isActive" | "licenseActivated">
): Promise<IngestAccessResolution> {
  const roles = await getUserRoles(user);

  if (!user.isActive) {
    return {
      accessTier: "none",
      capabilities: capabilitiesForIngestTier("none"),
      roles,
      invalidLicenseCode: null
    };
  }

  if (roles.includes("super_admin")) {
    return {
      accessTier: "full_ingest",
      capabilities: capabilitiesForIngestTier("full_ingest"),
      roles,
      invalidLicenseCode: null
    };
  }

  const hasPrivilegedIngestRole = roles.some((role) =>
    role === "kb_admin" || role === "ingest_admin" || role === "enterprise_admin"
  );
  const [hasActiveIngestLicense, hasActiveUserLicense] = await Promise.all([
    hasRedeemedLicenseForAppType(user.id, "ingest_admin"),
    hasRedeemedLicenseForAppType(user.id, "user_app")
  ]);

  let hasLegacyUserLicense = false;
  let accessTier = resolveIngestAccessTierFromFacts({
    isActive: user.isActive,
    isSuperAdmin: false,
    hasPrivilegedIngestRole,
    hasActiveIngestLicense,
    hasActiveUserLicense,
    hasLegacyUserLicense
  });

  if (accessTier === "full_ingest") {
    return {
      accessTier: "full_ingest",
      capabilities: capabilitiesForIngestTier("full_ingest"),
      roles,
      invalidLicenseCode: null
    };
  }

  if (accessTier === "chat_only") {
    return {
      accessTier: "chat_only",
      capabilities: capabilitiesForIngestTier("chat_only"),
      roles,
      invalidLicenseCode: null
    };
  }

  // Preserve compatibility for user accounts created before LicenseKey bindings existed.
  if (!hasPrivilegedIngestRole && user.licenseActivated) {
    try {
      await checkUserLicense(user.id, "user_app");
      hasLegacyUserLicense = true;
    } catch (error) {
      const appError = toAppError(error);

      if (appError.statusCode >= 500) {
        throw error;
      }
    }
  }

  accessTier = resolveIngestAccessTierFromFacts({
    isActive: user.isActive,
    isSuperAdmin: false,
    hasPrivilegedIngestRole,
    hasActiveIngestLicense,
    hasActiveUserLicense,
    hasLegacyUserLicense
  });

  if (accessTier === "chat_only") {
    return {
      accessTier,
      capabilities: capabilitiesForIngestTier(accessTier),
      roles,
      invalidLicenseCode: null
    };
  }

  const [ingestInvalidCode, userInvalidCode] = await Promise.all([
    readInvalidLicenseCode(user.id, "ingest_admin"),
    readInvalidLicenseCode(user.id, "user_app")
  ]);
  const invalidLicenseCode = ingestInvalidCode ?? userInvalidCode;

  return {
    accessTier: "none",
    capabilities: capabilitiesForIngestTier("none"),
    roles,
    invalidLicenseCode
  };
}
