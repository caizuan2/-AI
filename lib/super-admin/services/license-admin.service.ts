import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { LicenseKeyStatus, Prisma } from "@prisma/client";
import { getAuditRequestContext } from "@/lib/audit-log";
import { getAcceptedLicenseHashes, hashLicenseKey, normalizeLicenseKey } from "@/lib/auth/license";
import { initializeTeamOsStandardPlans } from "@/apps/team-os/features/licensing/services/team-os-license-repository";
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
  SuperAdminLicenseActivationRecord,
  SuperAdminLicenseAppType,
  SuperAdminLicenseAuditRecord,
  SuperAdminLicenseDashboardData,
  SuperAdminLicenseGenerationInput,
  SuperAdminLicenseGenerationResult,
  SuperAdminLicensePlan,
  SuperAdminLicenseRecord,
  SuperAdminLicenseRevealResult,
  SuperAdminLicenseSummary,
  UnifiedLicenseProduct
} from "@/types/super-admin-licenses";

const LICENSE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LICENSE_APP_TYPES: SuperAdminLicenseAppType[] = ["user_app", "ingest_admin", "team_os", "super_admin"];
const GENERATABLE_LICENSE_APP_TYPES: UnifiedLicenseProduct[] = ["user_app", "ingest_admin", "team_os"];
const LICENSE_PLANS: SuperAdminLicensePlan[] = ["free", "pro", "enterprise"];
const LICENSE_METADATA_ACTIONS = [
  "generate_user_app_license_key",
  "generate_ingest_admin_license_key",
  "generate_team_os_license_key",
  "generate_super_admin_license_key",
  "redeem_team_os_license_key",
  "renew_license_key",
  "disable_license_key",
  "SUPER_ADMIN_LICENSE_GENERATE",
  "SUPER_ADMIN_LICENSE_DISABLE"
];
const LICENSE_AUDIT_ACTIONS = [...LICENSE_METADATA_ACTIONS, "reveal_license_key"];
const PLAIN_LICENSE_KEY_PATTERN = /^XT-(?:(?:USER|INGEST|SUPER)(?:-[A-Z0-9]{4}){3}|TEAM(?:-[A-Z0-9]{4}){3,4})$/;
const LICENSE_SEARCH_IGNORABLE_CHARACTERS = /[\u00AD\u200B-\u200D\u2060\uFEFF]/g;
const LICENSE_SEARCH_BATCH_SIZE = 250;
const LEGACY_DEFAULT_LICENSE_SECRET = "aikb-license-v1-default-secret";

type LicenseMetadata = {
  appType: SuperAdminLicenseAppType;
  plan: SuperAdminLicensePlan;
  tenantId: string | null;
  note: string | null;
  maxActivations: number;
  planId: string | null;
  planName: string | null;
  subscriptionDays: number | null;
  companyId: string | null;
  teamId: string | null;
  subscriptionId: string | null;
  subscriptionEndsAt: string | null;
};

const TEAM_OS_PLAN_IDS: Record<SuperAdminLicensePlan, string> = {
  free: "team-os-plan-basic-v1",
  pro: "team-os-plan-professional-v1",
  enterprise: "team-os-plan-enterprise-v1"
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

function normalizeLicenseSearchKey(value: string) {
  return normalizeLicenseKey(value.replace(LICENSE_SEARCH_IGNORABLE_CHARACTERS, ""));
}

function getLegacyDefaultLicenseHash(normalizedKey: string) {
  return createHmac("sha256", LEGACY_DEFAULT_LICENSE_SECRET).update(normalizedKey).digest("hex");
}

function licenseKeysMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

async function findLicenseByEncryptedKey(normalizedKey: string): Promise<LicenseWithRedeemer | null> {
  let cursor: string | undefined;

  while (true) {
    const licenses = await prisma.licenseKey.findMany({
      where: {
        encryptedKey: {
          not: null
        }
      },
      orderBy: {
        id: "asc"
      },
      take: LICENSE_SEARCH_BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
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

    for (const license of licenses) {
      if (!license.encryptedKey) {
        continue;
      }

      try {
        const decryptedKey = normalizeLicenseSearchKey(decryptLicenseKey(license.encryptedKey));

        if (licenseKeysMatch(decryptedKey, normalizedKey)) {
          return license;
        }
      } catch {
        // A record encrypted with an unavailable historical key must not block
        // searches for other recoverable license records.
      }
    }

    if (licenses.length < LICENSE_SEARCH_BATCH_SIZE) {
      return null;
    }

    cursor = licenses.at(-1)?.id;
  }
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

  if (appType === "team_os") {
    return "XT-TEAM";
  }

  return "XT-USER";
}

function generatePlainLicense(appType: SuperAdminLicenseAppType) {
  const groupCount = appType === "team_os" ? 4 : 3;
  return `${getLicensePrefix(appType)}-${Array.from({ length: groupCount }, () => randomGroup(4)).join("-")}`;
}

function normalizeStoredAppType(value: unknown): SuperAdminLicenseAppType {
  return typeof value === "string" && LICENSE_APP_TYPES.includes(value as SuperAdminLicenseAppType)
    ? (value as SuperAdminLicenseAppType)
    : "user_app";
}

function normalizeGenerationAppType(value: unknown): UnifiedLicenseProduct {
  if (value === undefined || value === null || value === "") {
    return "user_app";
  }
  if (typeof value === "string" && GENERATABLE_LICENSE_APP_TYPES.includes(value as UnifiedLicenseProduct)) {
    return value as UnifiedLicenseProduct;
  }
  throw new ValidationError("卡密类型必须是 user_app、ingest_admin 或 team_os。");
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

function normalizeSubscriptionDays(value: unknown, appType: UnifiedLicenseProduct) {
  if (appType !== "team_os") {
    return null;
  }
  const days = value === null || value === undefined || value === "" ? 365 : Number(value);
  if (!Number.isFinite(days) || days <= 0) {
    throw new ValidationError("AI Team OS 开通天数必须大于 0。");
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
  const appType = normalizeGenerationAppType(input.appType);
  return {
    appType,
    plan: normalizePlan(input.plan),
    count: normalizeCount(input.count),
    expiresInDays: normalizeExpiresInDays(input.expiresInDays),
    subscriptionDays: normalizeSubscriptionDays(input.subscriptionDays, appType),
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
    appType: normalizeStoredAppType(metadata.appType),
    plan: normalizePlan(metadata.plan),
    tenantId: typeof metadata.tenantId === "string" ? metadata.tenantId : null,
    note: typeof metadata.note === "string" ? metadata.note : null,
    maxActivations: typeof metadata.maxActivations === "number" ? metadata.maxActivations : 1,
    planId: typeof metadata.planId === "string" ? metadata.planId : null,
    planName: typeof metadata.planName === "string" ? metadata.planName : null,
    subscriptionDays: typeof metadata.subscriptionDays === "number" ? metadata.subscriptionDays : null,
    companyId: typeof metadata.companyId === "string" ? metadata.companyId : null,
    teamId: typeof metadata.teamId === "string" ? metadata.teamId : null,
    subscriptionId: typeof metadata.subscriptionId === "string" ? metadata.subscriptionId : null,
    subscriptionEndsAt: typeof metadata.subscriptionEndsAt === "string" &&
      !Number.isNaN(new Date(metadata.subscriptionEndsAt).getTime())
      ? metadata.subscriptionEndsAt
      : null
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
    maxActivations: 1,
    planId: null,
    planName: null,
    subscriptionDays: null,
    companyId: null,
    teamId: null,
    subscriptionId: null,
    subscriptionEndsAt: null
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
    redeemedByUserAccount: getRedeemerAccount(license),
    teamOsCompanyId: resolvedMetadata.companyId,
    teamOsTeamId: resolvedMetadata.teamId,
    subscriptionDays: resolvedMetadata.subscriptionDays,
    subscriptionEndsAt: resolvedMetadata.subscriptionEndsAt
  };
}

function getGenerateAuditAction(appType: SuperAdminLicenseAppType) {
  if (appType === "ingest_admin") {
    return "generate_ingest_admin_license_key";
  }

  if (appType === "super_admin") {
    return "generate_super_admin_license_key";
  }

  if (appType === "team_os") {
    return "generate_team_os_license_key";
  }

  return "generate_user_app_license_key";
}

async function createLicenseAuditLog(input: {
  actor: Pick<RbacUser, "id" | "role">;
  action: string;
  licenseId: string;
  request?: Request;
  metadata: LicenseMetadata & Record<string, unknown>;
  transaction?: Prisma.TransactionClient;
}) {
  const requestContext = getAuditRequestContext(input.request);
  const data = {
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
  };

  if (input.transaction) {
    await input.transaction.auditLog.create({ data });
    return;
  }

  await prisma.auditLog.create({
    data: {
      ...data
    }
  });
}

async function getLicenseMetadataForUpdate(transaction: Prisma.TransactionClient, licenseId: string) {
  const logs = await transaction.auditLog.findMany({
    where: {
      action: { in: LICENSE_AUDIT_ACTIONS },
      targetType: "license_key",
      targetId: licenseId
    },
    orderBy: { createdAt: "desc" },
    select: { metadata: true }
  });

  for (const log of logs) {
    const metadata = readMetadata(log.metadata);
    if (metadata) return metadata;
  }

  return getDefaultMetadata();
}

async function lockLicenseForUpdate(transaction: Prisma.TransactionClient, keyHash: string) {
  await transaction.$queryRaw`SELECT 1::int AS "locked" FROM pg_advisory_xact_lock(hashtext(${`team-os:license:${keyHash}`}))`;
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
    team_os: 0,
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

async function getSuperAdminLicenseActivations(
  licenses: LicenseWithRedeemer[],
  metadataMap: Map<string, LicenseMetadata>,
  limit = 100
): Promise<SuperAdminLicenseActivationRecord[]> {
  const licenseByHash = new Map(licenses.map((license) => [license.keyHash, license]));
  const logs = await prisma.activationLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit
  });

  return logs.map((log) => {
    const license = licenseByHash.get(log.codeHash);
    return {
      id: log.id,
      licenseId: license?.id ?? null,
      displayKey: license ? maskLicenseKey(license) : `HASH-${log.codeHash.slice(-8).toUpperCase()}`,
      appType: license ? (metadataMap.get(license.id)?.appType ?? "user_app") : null,
      userId: log.userId,
      success: log.success,
      message: log.message,
      ip: log.ip,
      userAgent: log.userAgent,
      createdAt: log.createdAt.toISOString()
    };
  });
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
    activations: await getSuperAdminLicenseActivations(licenses, metadataMap),
    audit: await getSuperAdminLicenseAudit(10)
  };
}

export async function searchSuperAdminLicenses(input: {
  query?: unknown;
  appType?: unknown;
}): Promise<SuperAdminLicenseRecord[]> {
  const query = normalizeText(input.query, 200);

  if (!query) {
    throw new ValidationError("请输入要搜索的卡密、激活用户或账号。");
  }

  const appType = normalizeGenerationAppType(input.appType);
  const normalizedLicenseKey = normalizeLicenseSearchKey(query);
  const keyHashes = PLAIN_LICENSE_KEY_PATTERN.test(normalizedLicenseKey)
    ? Array.from(
        new Set([
          ...getAcceptedLicenseHashes(normalizedLicenseKey),
          getLegacyDefaultLicenseHash(normalizedLicenseKey)
        ])
      )
    : [];
  let where: Prisma.LicenseKeyWhereInput;

  if (keyHashes.length > 0) {
    // Never send the plaintext key to Prisma or persist it in search metadata.
    where = {
      keyHash: {
        in: keyHashes
      }
    };
  } else {
    const idFragment = query.replace(/^HASH-/i, "").trim();
    const filters: Prisma.LicenseKeyWhereInput[] = [
      {
        redeemedByUserId: {
          contains: query,
          mode: "insensitive"
        }
      },
      {
        redeemedByUser: {
          is: {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { phone: { contains: query, mode: "insensitive" } },
              { email: { contains: query, mode: "insensitive" } }
            ]
          }
        }
      }
    ];

    if (idFragment) {
      filters.unshift({
        id: {
          contains: idFragment,
          mode: "insensitive"
        }
      });
    }

    where = { OR: filters };
  }

  let licenses = await prisma.licenseKey.findMany({
    where,
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

  if (keyHashes.length > 0 && licenses.length === 0) {
    const encryptedMatch = await findLicenseByEncryptedKey(normalizedLicenseKey);

    if (encryptedMatch) {
      licenses = [encryptedMatch];
      console.warn("[super-admin:license-search] recovered encrypted license after hash lookup miss", {
        licenseId: encryptedMatch.id,
        requestedAppType: appType
      });
    }
  }

  const metadataMap = await getLicenseMetadataMap(licenses.map((license) => license.id));
  const enrichedLicenses = licenses.map((license) => enrichLicense(license, metadataMap.get(license.id)));
  const matchingLicenses = enrichedLicenses.filter((license) => license.appType === appType);

  if (keyHashes.length > 0 && enrichedLicenses.length > 0 && matchingLicenses.length === 0) {
    throw new ValidationError("已找到该卡密，但其应用归属与当前卡密列表不一致。");
  }

  return matchingLicenses;
}

export async function generateSuperAdminLicenses(
  actor: Pick<RbacUser, "id" | "role">,
  input: SuperAdminLicenseGenerationInput,
  request?: Request
): Promise<SuperAdminLicenseGenerationResult> {
  const normalized = normalizeGenerationInput(input);
  const expiresAt = getExpiresAt(normalized.expiresInDays);
  const generated: SuperAdminGeneratedLicense[] = [];
  let teamOsPlan: { id: string; name: string } | null = null;

  if (normalized.appType === "team_os") {
    if ((process.env.LICENSE_SECRET?.trim().length ?? 0) < 32) {
      throw new ValidationError("LICENSE_SECRET 未配置或长度不足，不能签发 XT-TEAM 企业授权码。");
    }
    await initializeTeamOsStandardPlans();
    teamOsPlan = await prisma.subscriptionPlan.findFirst({
      where: { id: TEAM_OS_PLAN_IDS[normalized.plan], status: "ACTIVE" },
      select: { id: true, name: true }
    });
    if (!teamOsPlan) {
      throw new ValidationError("AI Team OS 套餐初始化失败，请检查套餐配置。");
    }
  }

  for (let index = 0; index < normalized.count; index += 1) {
    let createdLicense: SuperAdminGeneratedLicense | null = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const plainKey = generatePlainLicense(normalized.appType);

      try {
        const metadata = {
          appType: normalized.appType,
          plan: normalized.plan,
          tenantId: normalized.appType === "team_os" ? null : normalized.tenantId,
          note: normalized.note,
          maxActivations: normalized.maxActivations,
          expiresAt: toIso(expiresAt),
          planId: teamOsPlan?.id ?? null,
          planName: teamOsPlan?.name ?? null,
          subscriptionDays: normalized.subscriptionDays,
          companyId: null,
          teamId: null,
          subscriptionId: null,
          subscriptionEndsAt: null
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
          expiresAt: toIso(license.expiresAt),
          subscriptionDays: normalized.subscriptionDays
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
      ...metadata,
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
  const result = await prisma.$transaction(async (transaction) => {
    const initialLicense = await transaction.licenseKey.findUnique({
      where: { id: licenseId },
      select: { keyHash: true }
    });
    if (!initialLicense) throw new NotFoundError("卡密不存在。");
    await lockLicenseForUpdate(transaction, initialLicense.keyHash);

    const license = await transaction.licenseKey.findUnique({
      where: { id: licenseId },
      include: {
        redeemedByUser: {
          select: { phone: true, email: true, name: true }
        }
      }
    });
    if (!license) throw new NotFoundError("卡密不存在。");
    const metadata = await getLicenseMetadataForUpdate(transaction, license.id);
    if (metadata.appType === "team_os" && license.status === LicenseKeyStatus.USED && !metadata.companyId) {
      throw new ValidationError("Team OS 卡密缺少企业绑定记录，禁止仅禁用卡片而遗漏企业订阅。");
    }

    const updated = await transaction.licenseKey.update({
      where: { id: license.id },
      data: { status: LicenseKeyStatus.DISABLED },
      include: {
        redeemedByUser: {
          select: { phone: true, email: true, name: true }
        }
      }
    });

    let userLicenseDeactivated = false;

    if (license.redeemedByUserId) {
      const now = new Date();
      const remainingActiveLicenses = await transaction.licenseKey.count({
        where: {
          id: { not: license.id },
          redeemedByUserId: license.redeemedByUserId,
          status: LicenseKeyStatus.USED,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: now } }
          ]
        }
      });

      if (remainingActiveLicenses === 0) {
        const deactivatedUsers = await transaction.user.updateMany({
          where: {
            id: license.redeemedByUserId,
            licenseActivated: true
          },
          data: { licenseActivated: false }
        });
        userLicenseDeactivated = deactivatedUsers.count > 0;
      }
    }

    let teamOsSubscriptionCancelled = false;
    if (metadata.appType === "team_os" && metadata.companyId) {
      const cancelledSubscriptions = await transaction.tenantSubscription.updateMany({
        where: { companyId: metadata.companyId, status: "ACTIVE" },
        data: { status: "CANCELLED" }
      });
      teamOsSubscriptionCancelled = cancelledSubscriptions.count > 0;
    }

    await createLicenseAuditLog({
      actor,
      action: "disable_license_key",
      licenseId: updated.id,
      request,
      transaction,
      metadata: {
        ...metadata,
        beforeStatus: license.status,
        afterStatus: updated.status,
        userLicenseDeactivated,
        teamOsSubscriptionCancelled
      }
    });

    return { updated, metadata };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable
  });

  return enrichLicense(result.updated, result.metadata);
}

function normalizeRenewDays(value: unknown) {
  const days = typeof value === "number" ? value : Number(value ?? 365);
  if (!Number.isFinite(days) || days <= 0) {
    throw new ValidationError("续期天数必须大于 0。");
  }
  return Math.min(3650, Math.trunc(days));
}

export async function renewSuperAdminLicense(
  actor: Pick<RbacUser, "id" | "role">,
  licenseId: string,
  input: { days?: number },
  request?: Request
) {
  const days = normalizeRenewDays(input.days);
  const dayMilliseconds = 24 * 60 * 60 * 1000;
  const result = await prisma.$transaction(async (transaction) => {
    const initialLicense = await transaction.licenseKey.findUnique({
      where: { id: licenseId },
      select: { keyHash: true }
    });
    if (!initialLicense) throw new NotFoundError("卡密不存在。");
    await lockLicenseForUpdate(transaction, initialLicense.keyHash);

    const license = await transaction.licenseKey.findUnique({
      where: { id: licenseId },
      include: {
        redeemedByUser: {
          select: { phone: true, email: true, name: true }
        }
      }
    });
    if (!license) throw new NotFoundError("卡密不存在。");
    if (license.status === LicenseKeyStatus.DISABLED) {
      throw new ValidationError("已禁用卡密不能直接续期，请先核对禁用原因。");
    }

    const metadata = await getLicenseMetadataForUpdate(transaction, license.id);
    const now = new Date();
    const licenseBase = license.expiresAt && license.expiresAt > now ? license.expiresAt : now;
    let nextLicenseExpiresAt = new Date(licenseBase.getTime() + days * dayMilliseconds);
    let nextMetadata = metadata;

    if (metadata.appType === "team_os" && license.status === LicenseKeyStatus.USED) {
      if (!metadata.companyId) {
        throw new ValidationError("Team OS 卡密缺少企业绑定记录，无法续期企业订阅。");
      }
      const subscription = metadata.subscriptionId
        ? await transaction.tenantSubscription.findUnique({ where: { id: metadata.subscriptionId } })
        : await transaction.tenantSubscription.findFirst({
            where: { companyId: metadata.companyId },
            orderBy: [{ endDate: "desc" }, { createdAt: "desc" }]
          });
      if (!subscription) throw new NotFoundError("Team OS 企业订阅不存在，无法续期。");
      const subscriptionBase = subscription.endDate > now ? subscription.endDate : now;
      const nextSubscriptionEnd = new Date(subscriptionBase.getTime() + days * dayMilliseconds);
      await transaction.tenantSubscription.update({
        where: { id: subscription.id },
        data: { endDate: nextSubscriptionEnd, status: "ACTIVE" }
      });
      await transaction.tenantCompany.updateMany({
        where: { id: metadata.companyId, status: "EXPIRED" },
        data: { status: "ACTIVE" }
      });
      nextMetadata = {
        ...metadata,
        subscriptionId: subscription.id,
        subscriptionEndsAt: nextSubscriptionEnd.toISOString()
      };
      nextLicenseExpiresAt = nextSubscriptionEnd;
    }

    const updated = await transaction.licenseKey.update({
      where: { id: license.id },
      data: { expiresAt: nextLicenseExpiresAt },
      include: {
        redeemedByUser: { select: { phone: true, email: true, name: true } }
      }
    });

    await createLicenseAuditLog({
      actor,
      action: "renew_license_key",
      licenseId: license.id,
      request,
      transaction,
      metadata: {
        ...nextMetadata,
        beforeExpiresAt: toIso(license.expiresAt),
        afterExpiresAt: toIso(updated.expiresAt),
        renewalDays: days
      }
    });

    return { updated, metadata: nextMetadata };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable
  });

  return enrichLicense(result.updated, result.metadata);
}
