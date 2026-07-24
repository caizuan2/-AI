import "server-only";

import { requireUser } from "@/lib/auth";
import { requireKbAdmin } from "@/lib/auth/guards";
import type { RbacUser } from "@/lib/auth/rbac";
import {
  ForbiddenError,
  IngestFullAccessRequiredError,
  LicenseDisabledError,
  LicenseExpiredError,
  LicenseRequiredError,
  toAppError
} from "@/lib/errors";
import type { AuditAction } from "@/lib/audit-log";
import { getHighestRole } from "@/lib/rbac/roles";
import {
  resolveIngestAccessTier,
  type IngestAccessResolution
} from "@/lib/enterprise/ingest-access-tier";

type AdminIngestGuardOptions = {
  deniedAction?: AuditAction;
  targetType?: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  requireLicense?: boolean;
};

export async function requireAdminIngestActor(
  request: Request,
  options: AdminIngestGuardOptions = {}
): Promise<RbacUser> {
  try {
    return await requireKbAdmin(request, options);
  } catch (error) {
    const appError = toAppError(error);

    if (!(error instanceof ForbiddenError) && appError.statusCode !== 403) {
      throw error;
    }

    const user = await requireUser();
    const access = await resolveIngestAccessTier(user);

    if (access.accessTier === "chat_only") {
      throw new IngestFullAccessRequiredError();
    }

    if (access.accessTier !== "full_ingest") {
      throw error;
    }

    return {
      ...user,
      role: getHighestRole(access.roles),
      roles: access.roles
    };
  }
}

export type AdminIngestChatAccess = {
  actor: RbacUser;
  access: IngestAccessResolution;
};

export async function requireAdminIngestChatAccess(): Promise<AdminIngestChatAccess> {
  const user = await requireUser();
  const access = await resolveIngestAccessTier(user);

  if (access.accessTier === "none") {
    if (access.invalidLicenseCode === "LICENSE_DISABLED") {
      throw new LicenseDisabledError();
    }

    if (access.invalidLicenseCode === "LICENSE_EXPIRED") {
      throw new LicenseExpiredError();
    }

    throw new LicenseRequiredError("请使用有效的用户端或投喂端卡密激活后再继续。");
  }

  return {
    actor: {
      ...user,
      role: getHighestRole(access.roles),
      roles: access.roles
    },
    access
  };
}

export async function requireAdminIngestChatActor(): Promise<RbacUser> {
  return (await requireAdminIngestChatAccess()).actor;
}

export async function requireFullAdminIngestAccess(): Promise<void> {
  const user = await requireUser();
  const access = await resolveIngestAccessTier(user);

  if (access.accessTier === "chat_only") {
    throw new IngestFullAccessRequiredError();
  }

  if (access.accessTier === "none") {
    if (access.invalidLicenseCode === "LICENSE_DISABLED") {
      throw new LicenseDisabledError();
    }

    if (access.invalidLicenseCode === "LICENSE_EXPIRED") {
      throw new LicenseExpiredError();
    }

    throw new LicenseRequiredError("请使用有效的投喂端卡密激活后再继续。");
  }
}
