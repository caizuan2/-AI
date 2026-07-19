import "server-only";

import { LicenseKeyStatus, Prisma } from "@prisma/client";

import { TEAM_OS_STANDARD_PLAN_IDS } from "@/apps/team-os/features/licensing/constants";
import type {
  ConsumeTeamOsLicenseInput,
  TeamOsLicenseGrant,
  TeamOsLicenseStatus
} from "@/apps/team-os/features/licensing/types";
import { TEAM_OS_FEATURE_KEYS } from "@/apps/team-os/features/tenant/types";
import { getAuditRequestContext } from "@/lib/audit-log";
import {
  getAcceptedLicenseHashes,
  getLicenseAppTypeFromKey,
  hashLicenseKey,
  isSupportedLicenseKeyInput
} from "@/lib/auth/license";
import {
  AppError,
  ConfigError,
  InvalidLicenseKeyError,
  LicenseActivationLimitReachedError,
  LicenseAppTypeMismatchError,
  LicenseDisabledError,
  LicenseExpiredError,
  LicenseNotFoundError,
  NotFoundError
} from "@/lib/errors";
import { prisma } from "@/lib/prisma";

type LicenseTransaction = Prisma.TransactionClient;

type TeamOsLicenseMetadata = {
  plan: "free" | "pro" | "enterprise";
  planId: string;
  planName: string;
  subscriptionDays: number;
  note: string | null;
  companyId: string | null;
  teamId: string | null;
  subscriptionId: string | null;
  subscriptionEndsAt: Date | null;
};

const TEAM_OS_LICENSE_METADATA_ACTIONS = [
  "generate_team_os_license_key",
  "redeem_team_os_license_key",
  "renew_license_key",
  "disable_license_key"
] as const;

const standardPlans = [
  {
    id: TEAM_OS_STANDARD_PLAN_IDS.basic,
    name: "基础版",
    description: "适合小型团队的知识协作与任务执行。",
    maxUsers: 20,
    maxStorage: 10,
    price: "299.00",
    enabledFeatures: ["knowledge", "tasks"]
  },
  {
    id: TEAM_OS_STANDARD_PLAN_IDS.professional,
    name: "专业版",
    description: "开放 AI 教练、CRM 与培训能力，适合成长型企业。",
    maxUsers: 100,
    maxStorage: 100,
    price: "999.00",
    enabledFeatures: ["knowledge", "tasks", "ai_coach", "crm", "training"]
  },
  {
    id: TEAM_OS_STANDARD_PLAN_IDS.enterprise,
    name: "企业版",
    description: "开放全部 AI Team OS 能力及企业数据分析。",
    maxUsers: 1000,
    maxStorage: 1024,
    price: "2999.00",
    enabledFeatures: [...TEAM_OS_FEATURE_KEYS]
  }
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readTeamOsMetadata(value: unknown): TeamOsLicenseMetadata | null {
  if (!isRecord(value) || value.appType !== "team_os") return null;
  const planId = readString(value.planId);
  const planName = readString(value.planName);
  const subscriptionDays = Number(value.subscriptionDays);
  const plan = value.plan;
  const subscriptionEndsAtValue = readString(value.subscriptionEndsAt);
  const subscriptionEndsAt = subscriptionEndsAtValue ? new Date(subscriptionEndsAtValue) : null;

  if (
    !planId ||
    !planName ||
    !Number.isInteger(subscriptionDays) ||
    subscriptionDays < 1 ||
    (plan !== "free" && plan !== "pro" && plan !== "enterprise")
  ) {
    return null;
  }

  return {
    plan,
    planId,
    planName,
    subscriptionDays,
    note: readString(value.note),
    companyId: readString(value.companyId),
    teamId: readString(value.teamId),
    subscriptionId: readString(value.subscriptionId),
    subscriptionEndsAt: subscriptionEndsAt && !Number.isNaN(subscriptionEndsAt.getTime())
      ? subscriptionEndsAt
      : null
  };
}

function requireLicenseSecret() {
  if ((process.env.LICENSE_SECRET?.trim().length ?? 0) < 32) {
    throw new ConfigError("LICENSE_SECRET 未配置或长度不足，不能校验 XT-TEAM 企业授权码。");
  }
}

function requireTeamOsLicenseCode(code: string) {
  requireLicenseSecret();
  if (!isSupportedLicenseKeyInput(code)) {
    throw new InvalidLicenseKeyError("AI Team OS 企业授权码格式无效。");
  }
  if (getLicenseAppTypeFromKey(code) !== "team_os") {
    throw new LicenseAppTypeMismatchError("该卡密不属于 AI Team OS 企业授权。");
  }
}

export function hashTeamOsLicenseCode(code: string) {
  requireTeamOsLicenseCode(code);
  return hashLicenseKey(code);
}

async function lockLicense(transaction: LicenseTransaction, codeHash: string) {
  await transaction.$queryRaw`SELECT 1::int AS "locked" FROM pg_advisory_xact_lock(hashtext(${`team-os:license:${codeHash}`}))`;
}

async function findLicense(transaction: LicenseTransaction, code: string) {
  requireTeamOsLicenseCode(code);
  const keyHashes = getAcceptedLicenseHashes(code);
  const licenses = await transaction.licenseKey.findMany({
    where: { keyHash: { in: keyHashes } },
    orderBy: { createdAt: "desc" }
  });
  return licenses.find((license) => license.status === LicenseKeyStatus.USED)
    ?? licenses.find((license) => license.status === LicenseKeyStatus.DISABLED)
    ?? licenses.find((license) => license.status === LicenseKeyStatus.UNUSED)
    ?? licenses[0]
    ?? null;
}

async function loadMetadata(transaction: LicenseTransaction, licenseId: string) {
  const audit = await transaction.auditLog.findFirst({
    where: {
      targetType: "license_key",
      targetId: licenseId,
      action: { in: [...TEAM_OS_LICENSE_METADATA_ACTIONS] }
    },
    orderBy: { createdAt: "desc" },
    select: { metadata: true }
  });
  return readTeamOsMetadata(audit?.metadata);
}

function toStatus(status: LicenseKeyStatus, expiresAt: Date | null, now: Date): TeamOsLicenseStatus {
  if (status === LicenseKeyStatus.DISABLED) return "REVOKED";
  if (status === LicenseKeyStatus.USED) return "USED";
  if (expiresAt && expiresAt <= now) return "EXPIRED";
  return "UNUSED";
}

function toGrant(input: {
  license: {
    id: string;
    keyHash: string;
    status: LicenseKeyStatus;
    redeemedByUserId: string | null;
    redeemedAt: Date | null;
    expiresAt: Date | null;
    createdAt: Date;
  };
  metadata: TeamOsLicenseMetadata;
  now: Date;
  alreadyRedeemed: boolean;
}): TeamOsLicenseGrant {
  return {
    codeHash: input.license.keyHash,
    grantId: input.license.id,
    planId: input.metadata.planId,
    planName: input.metadata.planName,
    subscriptionDays: input.metadata.subscriptionDays,
    redeemBefore: input.license.expiresAt ?? new Date("9999-12-31T23:59:59.999Z"),
    issuedAt: input.license.createdAt,
    status: toStatus(input.license.status, input.license.expiresAt, input.now),
    note: input.metadata.note,
    redeemedAt: input.license.redeemedAt,
    redeemedByUserId: input.license.redeemedByUserId,
    companyId: input.metadata.companyId,
    teamId: input.metadata.teamId,
    revokedAt: input.license.status === LicenseKeyStatus.DISABLED ? input.license.redeemedAt : null,
    revokedByUserId: null,
    alreadyRedeemed: input.alreadyRedeemed
  };
}

export async function findTeamOsLicenseGrantByCode(code: string, now = new Date()) {
  return prisma.$transaction(async (transaction) => {
    const license = await findLicense(transaction, code);
    if (!license) return null;
    const metadata = await loadMetadata(transaction, license.id);
    if (!metadata) return null;
    return toGrant({ license, metadata, now, alreadyRedeemed: license.status === LicenseKeyStatus.USED });
  });
}

export async function verifyTeamOsLicenseGrantInTransaction(
  transaction: LicenseTransaction,
  code: string,
  now = new Date()
) {
  const codeHash = hashTeamOsLicenseCode(code);
  await lockLicense(transaction, codeHash);
  const license = await findLicense(transaction, code);
  if (!license) throw new LicenseNotFoundError("AI Team OS 企业授权码不存在。");
  const metadata = await loadMetadata(transaction, license.id);
  if (!metadata) throw new LicenseAppTypeMismatchError("该卡密不属于 AI Team OS 企业授权。");
  if (license.status === LicenseKeyStatus.DISABLED) {
    throw new LicenseDisabledError("AI Team OS 企业授权码已禁用。");
  }
  if (license.status === LicenseKeyStatus.USED) {
    throw new LicenseActivationLimitReachedError("AI Team OS 企业授权码已使用。");
  }
  if (license.expiresAt && license.expiresAt <= now) {
    throw new LicenseExpiredError("AI Team OS 企业授权码已过期。");
  }
  return toGrant({ license, metadata, now, alreadyRedeemed: false });
}

export async function consumeTeamOsLicenseGrantInTransaction(
  transaction: LicenseTransaction,
  input: ConsumeTeamOsLicenseInput
) {
  const now = input.now ?? new Date();
  const codeHash = hashTeamOsLicenseCode(input.code);
  await lockLicense(transaction, codeHash);
  const license = await findLicense(transaction, input.code);
  if (!license) throw new LicenseNotFoundError("AI Team OS 企业授权码不存在。");
  const metadata = await loadMetadata(transaction, license.id);
  if (!metadata) throw new LicenseAppTypeMismatchError("该卡密不属于 AI Team OS 企业授权。");
  if (license.status === LicenseKeyStatus.DISABLED) {
    throw new LicenseDisabledError("AI Team OS 企业授权码已禁用。");
  }
  if (license.status === LicenseKeyStatus.USED) {
    if (
      license.redeemedByUserId === input.userId &&
      metadata.companyId === input.companyId &&
      metadata.teamId === input.teamId
    ) {
      return toGrant({ license, metadata, now, alreadyRedeemed: true });
    }
    throw new LicenseActivationLimitReachedError("AI Team OS 企业授权码已使用。");
  }
  if (license.expiresAt && license.expiresAt <= now) {
    throw new LicenseExpiredError("AI Team OS 企业授权码已过期。");
  }

  const updated = await transaction.licenseKey.updateMany({
    where: {
      id: license.id,
      status: LicenseKeyStatus.UNUSED,
      redeemedByUserId: null
    },
    data: {
      status: LicenseKeyStatus.USED,
      redeemedByUserId: input.userId,
      redeemedAt: now
    }
  });
  if (updated.count !== 1) {
    throw new LicenseActivationLimitReachedError("AI Team OS 企业授权码已使用。");
  }

  const requestContext = getAuditRequestContext(input.request);
  const redeemedMetadata = {
    appType: "team_os",
    plan: metadata.plan,
    planId: metadata.planId,
    planName: metadata.planName,
    subscriptionDays: metadata.subscriptionDays,
    note: metadata.note,
    tenantId: null,
    maxActivations: 1,
    companyId: input.companyId,
    teamId: input.teamId,
    subscriptionId: null,
    subscriptionEndsAt: null,
    redeemedByUserId: input.userId,
    source: "team_os_company_activation"
  } satisfies Prisma.InputJsonObject;

  await transaction.activationLog.create({
    data: {
      codeHash: license.keyHash,
      userId: input.userId,
      success: true,
      message: "AI Team OS 企业授权激活成功。",
      ip: requestContext.ip,
      userAgent: requestContext.userAgent
    }
  });
  await transaction.auditLog.create({
    data: {
      userId: input.userId,
      action: "redeem_team_os_license_key",
      targetType: "license_key",
      targetId: license.id,
      ip: requestContext.ip,
      userAgent: requestContext.userAgent,
      metadata: redeemedMetadata
    }
  });

  return toGrant({
    license: { ...license, status: LicenseKeyStatus.USED, redeemedByUserId: input.userId, redeemedAt: now },
    metadata: { ...metadata, companyId: input.companyId, teamId: input.teamId },
    now,
    alreadyRedeemed: false
  });
}

export async function attachTeamOsSubscriptionToLicense(
  transaction: LicenseTransaction,
  input: {
    licenseId: string;
    userId: string;
    companyId: string;
    teamId: string;
    subscriptionId: string;
    subscriptionEndsAt: Date;
  }
) {
  const metadata = await loadMetadata(transaction, input.licenseId);
  if (!metadata) throw new AppError("DATABASE_ERROR", "AI Team OS 授权元数据缺失。", 500);
  await transaction.auditLog.create({
    data: {
      userId: input.userId,
      action: "redeem_team_os_license_key",
      targetType: "license_key",
      targetId: input.licenseId,
      metadata: {
        appType: "team_os",
        plan: metadata.plan,
        planId: metadata.planId,
        planName: metadata.planName,
        subscriptionDays: metadata.subscriptionDays,
        note: metadata.note,
        tenantId: null,
        maxActivations: 1,
        companyId: input.companyId,
        teamId: input.teamId,
        subscriptionId: input.subscriptionId,
        subscriptionEndsAt: input.subscriptionEndsAt.toISOString(),
        redeemedByUserId: input.userId,
        source: "team_os_subscription_binding"
      }
    }
  });
}

export async function recordTeamOsLicenseActivationFailure(input: {
  code: string;
  userId: string;
  error: unknown;
  request?: Request;
}) {
  const requestContext = getAuditRequestContext(input.request);
  const codeHash = hashLicenseKey(input.code);
  const message = input.error instanceof AppError
    ? input.error.message.slice(0, 200)
    : "AI Team OS 企业授权激活失败，请联系平台管理员并提供请求时间。";
  await prisma.activationLog.create({
    data: {
      codeHash,
      userId: input.userId,
      success: false,
      message,
      ip: requestContext.ip,
      userAgent: requestContext.userAgent
    }
  });
}

export async function initializeTeamOsStandardPlans() {
  await prisma.$transaction(async (transaction) => {
    for (const plan of standardPlans) {
      const existingPlan = await transaction.subscriptionPlan.findUnique({
        where: { id: plan.id },
        select: { id: true }
      });
      if (!existingPlan) {
        await transaction.subscriptionPlan.create({
          data: {
            id: plan.id,
            name: plan.name,
            description: plan.description,
            maxUsers: plan.maxUsers,
            maxStorage: plan.maxStorage,
            features: [...plan.enabledFeatures],
            price: plan.price,
            status: "ACTIVE"
          }
        });
      }
      for (const featureKey of TEAM_OS_FEATURE_KEYS) {
        const existingPermission = await transaction.featurePermission.findUnique({
          where: { planId_featureKey: { planId: plan.id, featureKey } },
          select: { id: true }
        });
        if (existingPermission) {
          continue;
        }
        await transaction.featurePermission.create({
          data: {
            planId: plan.id,
            featureKey,
            enabled: new Set<string>(plan.enabledFeatures).has(featureKey)
          }
        });
      }
    }
  });
  return { initialized: true, planIds: standardPlans.map((plan) => plan.id) };
}

export async function requireTeamOsPlan(planId: string) {
  const plan = await prisma.subscriptionPlan.findFirst({
    where: { id: planId, status: "ACTIVE" },
    select: { id: true, name: true, maxUsers: true }
  });
  if (!plan) throw new NotFoundError("AI Team OS 套餐不存在或已停用。");
  return plan;
}
