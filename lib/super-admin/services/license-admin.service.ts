import "server-only";

import { randomBytes } from "crypto";
import { LicenseKeyStatus, type Prisma } from "@prisma/client";
import { getAuditRequestContext } from "@/lib/audit-log";
import { hashLicenseKey } from "@/lib/auth/license";
import type { RbacUser } from "@/lib/auth/rbac";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  decryptLicenseKey,
  encryptLicenseKey,
  LICENSE_KEY_ENCRYPTION_VERSION
} from "@/lib/super-admin/license-key-crypto";
import type {
  SuperAdminGeneratedLicense,
  SuperAdminLicenseAppType,
  SuperAdminLicenseAuditRecord,
  SuperAdminLicenseDashboardData,
  SuperAdminLicenseGenerationInput,
  SuperAdminLicenseGenerationResult,
  SuperAdminLicensePlan,
  SuperAdminLicenseRecord,
  SuperAdminLicenseRevealResult,
  SuperAdminLicenseSummary
} from "@/types/super-admin-licenses";

const LICENSE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LICENSE_APP_TYPES: SuperAdminLicenseAppType[] = ["user_app", "ingest_admin", "super_admin"];
const LICENSE_PLANS: SuperAdminLicensePlan[] = ["free", "pro", "enterprise"];
const LICENSE_METADATA_ACTIONS = [
  "generate_user_app_license_key",
  "generate_ingest_admin_license_key",
  "generate_super_admin_license_key",
  "disable_license_key",
  "SUPER_ADMIN_LICENSE_GENERATE",
  "SUPER_ADMIN_LICENSE_DISABLE"
];
const LICENSE_AUDIT_ACTIONS = [...LICENSE_METADATA_ACTIONS, "reveal_license_key"];

type LicenseMetadata = {
  appType: SuperAdminLicenseAppType;
  plan: SuperAdminLicensePlan;
  tenantId: string | null;
  note: string | null;
  maxActivations: number;
};

type LicenseWithRedeemer = Prisma.LicenseKeyGetPayload<{
  include: {
    redeemedByUser: {
      select: {
        phone: true;
        email: true;
        name: true;
      };
    };
  };
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function randomGroup(length: number) {
  const bytes = randomBytes(length);

  return Array.from(bytes, (byte) => LICENSE_ALPHABET[byte % LICENSE_ALPHABET.length]).join("");
}

function getLicensePrefix(appType: SuperAdminLicenseAppType) {
  if (appType === "ingest_admin") {
    return "XT-INGEST";
  }

  if (appType === "super_admin") {
    return "XT-SUPER";
  }

  return "XT-USER";
}

function generatePlainLicense(appType: SuperAdminLicenseAppType) {
  return `${getLicensePrefix(appType)}-${randomGroup(4)}-${randomGroup(4)}-${randomGroup(4)}`;
}

function normalizeAppType(value: unknown): SuperAdminLicenseAppType {
  return typeof value === "string" && LICENSE_APP_TYPES.includes(value as SuperAdminLicenseAppType)
    ? (value as SuperAdminLicenseAppType)
    : "user_app";
}

function normalizePlan(value: unknown): SuperAdminLicensePlan {
  return typeof value === "string" && LICENSE_PLANS.includes(value as SuperAdminLicensePlan)
    ? (value as SuperAdminLicensePlan)
    : "pro";
}

function normalizeCount(value: unknown) {
  const count = typeof value === "number" ? value : Number(value ?? 1);

  if (!Number.isFinite(count)) {
    return 1;
  }

  return Math.min(200, Math.max(1, Math.trunc(count)));
}

function normalizeExpiresInDays(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const days = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(days) || days <= 0) {
    throw new ValidationError("到期天数必须为空或大于 0。");
  }

  return Math.min(3650, Math.trunc(days));
}

function normalizeMaxActivations(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return 1;
  }

  const maxActivations = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(maxActivations) || Math.trunc(maxActivations) !== 1) {
    throw new ValidationError("当前 LicenseKey 模型仅支持单次激活，maxActivations 必须为 1。");
  }

  return 1;
}

function normalizeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function normalizeGenerationInput(input: SuperAdminLicenseGenerationInput) {
  return {
    appType: normalizeAppType(input.appType),
    plan: normalizePlan(input.plan),
    count: normalizeCount(input.count),
    expiresInDays: normalizeExpiresInDays(input.expiresInDays),
    tenantId: normalizeText(input.tenantId, 80),
    note: normalizeText(input.note, 200),
    maxActivations: normalizeMaxActivations(input.maxActivations)
  };
}

function getExpiresAt(days: number | null) {
  if (!days) {
    return null;
  }

  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function readMetadata(metadata: unknown): LicenseMetadata | null {
  if (!isRecord(metadata)) {
    return null;
  }

  return {
    appType: normalizeAppType(metadata.appType),
    plan: normalizePlan(metadata.plan),
    tenantId: typeof metadata.tenantId === "string" ? metadata.tenantId : null,
    note: typeof metadata.note === "string" ? metadata.note : null,
    maxActivations: typeof metadata.maxActivations === "number" ? metadata.maxActivations : 1
  };
}

async function getLicenseMetadataMap(licenseIds: string[]) {
  if (licenseIds.length === 0) {
    return new Map<string, LicenseMetadata>();
  }

  const auditLogs = await prisma.auditLog.findMany({
    where: {
      action: {
        in: LICENSE_METADATA_ACTIONS
      },
      targetType: "license_key",
      targetId: {
        in: licenseIds
      }
    },
    orderBy: {
      createdAt: "desc"
    },
    select: {
      targetId: true,
      metadata: true
    }
  });
  const metadataMap = new Map<string, LicenseMetadata>();

  for (const log of auditLogs) {
    if (!log.targetId || metadataMap.has(log.targetId)) {
      continue;
    }

    const metadata = readMetadata(log.metadata);

    if (metadata) {
      metadataMap.set(log.targetId, metadata);
    }
  }

  return metadataMap;
}

function getDefaultMetadata(): LicenseMetadata {
  return {
    appType: "user_app",
    plan: "pro",
    tenantId: null,
    note: null,
    maxActivations: 1
  };
}

function toIso(value: Date | null) {
  return value ? value.toISOString() : null;
}

function maskLicenseKey(license: Pick<LicenseWithRedeemer, "id">) {
  return `HASH-${license.id.slice(-8).toUpperCase()}`;
}

function getRedeemerLabel(license: LicenseWithRedeemer) {
  const user = license.redeemedByUser;

  if (!user) {
    return null;
  }

  return user.name?.trim() || user.phone || user.email || license.redeemedByUserId;
}

function getRedeemerAccount(license: LicenseWithRedeemer) {
  const user = license.redeemedByUser;

  if (!user) {
    return null;
  }

  return user.phone || user.email || license.redeemedByUserId;
}

function enrichLicense(license: LicenseWithRedeemer, metadata?: LicenseMetadata): SuperAdminLicenseRecord {
  const resolvedMetadata = metadata ?? getDefaultMetadata();

  return {
    id: license.id,
    displayKey: maskLicenseKey(license),
    canReveal: Boolean(license.encryptedKey),
    appType: resolvedMetadata.appType,
    plan: resolvedMetadata.plan,
    status: license.status,
    tenantId: resolvedMetadata.tenantId,
    note: resolvedMetadata.note,
    maxActivations: resolvedMetadata.maxActivations,
    activationCount: license.status === LicenseKeyStatus.USED ? 1 : 0,
    createdAt: license.createdAt.toISOString(),
    expiresAt: toIso(license.expiresAt),
    activatedAt: toIso(license.redeemedAt),
    redeemedAt: toIso(license.redeemedAt),
    redeemedByUserId: license.redeemedByUserId,
    redeemedByUserLabel: getRedeemerLabel(license),
    redeemedByUserAccount: getRedeemerAccount(license)
  };
}

function getGenerateAuditAction(appType: SuperAdminLicenseAppType) {
  if (appType === "ingest_admin") {
    return "generate_ingest_admin_license_key";
  }

  if (appType === "super_admin") {
    return "generate_super_admin_license_key";
  }

  return "generate_user_app_license_key";
}

async function createLicenseAuditLog(input: {
  actor: Pick<RbacUser, "id" | "role">;
  action: string;
  licenseId: string;
  request?: Request;
  metadata: LicenseMetadata & Record<string, unknown>;
}) {
  const requestContext = getAuditRequestContext(input.request);

  await prisma.auditLog.create({
    data: {
      userId: input.actor.id,
      role: input.actor.role,
      action: input.action,
      targetType: "license_key",
      targetId: input.licenseId,
      ip: requestContext.ip,
      userAgent: requestContext.userAgent,
      metadata: {
        ...input.metadata,
        operatorUserId: input.actor.id,
        source: "super_admin_license_center"
      } satisfies Prisma.InputJsonObject
    }
  });
}

async function calculateSummary(): Promise<SuperAdminLicenseSummary> {
  const [total, unused, used, disabled, expiringSoon, allLicenses] = await Promise.all([
    prisma.licenseKey.count(),
    prisma.licenseKey.count({ where: { status: LicenseKeyStatus.UNUSED } }),
    prisma.licenseKey.count({ where: { status: LicenseKeyStatus.USED } }),
    prisma.licenseKey.count({ where: { status: LicenseKeyStatus.DISABLED } }),
    prisma.licenseKey.count({
      where: {
        expiresAt: {
          gte: new Date(),
          lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        }
      }
    }),
    prisma.licenseKey.findMany({
      select: {
        id: true
      }
    })
  ]);
  const metadataMap = await getLicenseMetadataMap(allLicenses.map((license) => license.id));
  const byAppType: SuperAdminLicenseSummary["byAppType"] = {
    user_app: 0,
    ingest_admin: 0,
    super_admin: 0
  };

  for (const license of allLicenses) {
    const appType = metadataMap.get(license.id)?.appType ?? "user_app";
    byAppType[appType] += 1;
  }

  return {
    total,
    unused,
    used,
    disabled,
    expiringSoon,
    byAppType
  };
}

export async function getSuperAdminLicenseAudit(limit = 30): Promise<SuperAdminLicenseAuditRecord[]> {
  const logs = await prisma.auditLog.findMany({
    where: {
      action: {
        in: LICENSE_AUDIT_ACTIONS
      },
      targetType: "license_key"
    },
    orderBy: {
      createdAt: "desc"
    },
    take: limit
  });

  return logs.map((log) => ({
    id: log.id,
    action: log.action,
    targetId: log.targetId,
    operatorUserId: log.userId,
    role: log.role,
    ip: log.ip,
    userAgent: log.userAgent,
    createdAt: log.createdAt.toISOString(),
    metadata: log.metadata
  }));
}

export async function getSuperAdminLicenseDashboard(): Promise<SuperAdminLicenseDashboardData> {
  const licenses = await prisma.licenseKey.findMany({
    orderBy: {
      createdAt: "desc"
    },
    take: 100,
    include: {
      redeemedByUser: {
        select: {
          phone: true,
          email: true,
          name: true
        }
      }
    }
  });
  const metadataMap = await getLicenseMetadataMap(licenses.map((license) => license.id));

  return {
    summary: await calculateSummary(),
    licenses: licenses.map((license) => enrichLicense(license, metadataMap.get(license.id))),
    audit: await getSuperAdminLicenseAudit(10)
  };
}

export async function generateSuperAdminLicenses(
  actor: Pick<RbacUser, "id" | "role">,
  input: SuperAdminLicenseGenerationInput,
  request?: Request
): Promise<SuperAdminLicenseGenerationResult> {
  const normalized = normalizeGenerationInput(input);
  const expiresAt = getExpiresAt(normalized.expiresInDays);
  const generated: SuperAdminGeneratedLicense[] = [];

  for (let index = 0; index < normalized.count; index += 1) {
    let createdLicense: SuperAdminGeneratedLicense | null = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const plainKey = generatePlainLicense(normalized.appType);

      try {
        const metadata = {
          appType: normalized.appType,
          plan: normalized.plan,
          tenantId: normalized.tenantId,
          note: normalized.note,
          maxActivations: normalized.maxActivations,
          expiresAt: toIso(expiresAt)
        };
        const requestContext = getAuditRequestContext(request);
        const license = await prisma.$transaction(async (tx) => {
          const created = await tx.licenseKey.create({
            data: {
              keyHash: hashLicenseKey(plainKey),
              encryptedKey: encryptLicenseKey(plainKey),
              encryptionKeyVersion: LICENSE_KEY_ENCRYPTION_VERSION,
              status: LicenseKeyStatus.UNUSED,
              expiresAt
            }
          });

          await tx.auditLog.create({
            data: {
              userId: actor.id,
              role: actor.role,
              action: getGenerateAuditAction(normalized.appType),
              targetType: "license_key",
              targetId: created.id,
              ip: requestContext.ip,
              userAgent: requestContext.userAgent,
              metadata: {
                ...metadata,
                operatorUserId: actor.id,
                source: "super_admin_license_center"
              } satisfies Prisma.InputJsonObject
            }
          });

          return created;
        });

        createdLicense = {
          id: license.id,
          key: plainKey,
          appType: normalized.appType,
          plan: normalized.plan,
          status: license.status,
          expiresAt: toIso(license.expiresAt)
        };
        break;
      } catch (error) {
        if (!isRecord(error) || error.code !== "P2002" || attempt === 4) {
          throw error;
        }
      }
    }

    if (!createdLicense) {
      throw new ValidationError("卡密生成失败，请重试。");
    }

    generated.push(createdLicense);
  }

  return {
    generated,
    summary: await calculateSummary()
  };
}

export async function revealSuperAdminLicense(
  actor: Pick<RbacUser, "id" | "role">,
  licenseId: string,
  request?: Request
): Promise<SuperAdminLicenseRevealResult> {
  const license = await prisma.licenseKey.findUnique({
    where: {
      id: licenseId
    }
  });

  if (!license) {
    throw new NotFoundError("卡密不存在。");
  }

  if (!license.encryptedKey || !license.encryptionKeyVersion) {
    throw new ValidationError("这张历史卡密未保存可恢复密文，请生成替代卡密。");
  }

  const plainKey = decryptLicenseKey(license.encryptedKey);
  const metadataMap = await getLicenseMetadataMap([license.id]);
  const metadata = metadataMap.get(license.id) ?? getDefaultMetadata();

  await createLicenseAuditLog({
    actor,
    action: "reveal_license_key",
    licenseId: license.id,
    request,
    metadata: {
      appType: metadata.appType,
      plan: metadata.plan,
      tenantId: metadata.tenantId,
      note: metadata.note,
      maxActivations: metadata.maxActivations,
      status: license.status,
      encryptionKeyVersion: license.encryptionKeyVersion,
      revealed: true
    }
  });

  return {
    id: license.id,
    key: plainKey
  };
}

export async function disableSuperAdminLicense(
  actor: Pick<RbacUser, "id" | "role">,
  licenseId: string,
  request?: Request
) {
  const license = await prisma.licenseKey.findUnique({
    where: {
      id: licenseId
    },
    include: {
      redeemedByUser: {
        select: {
          phone: true,
          email: true,
          name: true
        }
      }
    }
  });

  if (!license) {
    throw new NotFoundError("卡密不存在。");
  }

  const metadataMap = await getLicenseMetadataMap([license.id]);
  const metadata = metadataMap.get(license.id) ?? getDefaultMetadata();
  const updatedLicense = await prisma.licenseKey.update({
    where: {
      id: license.id
    },
    data: {
      status: LicenseKeyStatus.DISABLED
    },
    include: {
      redeemedByUser: {
        select: {
          phone: true,
          email: true,
          name: true
        }
      }
    }
  });

  await createLicenseAuditLog({
    actor,
    action: "disable_license_key",
    licenseId: updatedLicense.id,
    request,
    metadata: {
      ...metadata,
      beforeStatus: license.status,
      afterStatus: updatedLicense.status
    }
  });

  return enrichLicense(updatedLicense, metadata);
}
