import { createHash, createHmac, randomBytes } from "crypto";
import { LicenseKeyStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { BOOTSTRAP_SUPER_ADMIN_PHONE, isBootstrapSuperAdminUser } from "@/lib/auth/bootstrap-super-admin";
import { normalizePhone } from "@/lib/auth/phone";
import {
  ForbiddenError,
  InvalidLicenseKeyError,
  LicenseActivationLimitReachedError,
  LicenseAppTypeMismatchError,
  LicenseDisabledError,
  LicenseExpiredError,
  LicenseNotFoundError,
  LicenseRequiredError,
  NotFoundError
} from "@/lib/errors";

const LICENSE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LICENSE_KEY_PATTERN = /^AIKB-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const BOOTSTRAP_ADMIN_PHONES = [BOOTSTRAP_SUPER_ADMIN_PHONE];
const LICENSE_APP_TYPES = ["user_app", "ingest_admin", "super_admin"] as const;
const INGEST_ADMIN_DB_ROLE = "kb_admin" as const;
const LICENSE_METADATA_ACTIONS = [
  "generate_user_app_license_key",
  "generate_ingest_admin_license_key",
  "generate_super_admin_license_key",
  "disable_license_key",
  "SUPER_ADMIN_LICENSE_GENERATE",
  "SUPER_ADMIN_LICENSE_DISABLE"
];

export type LicenseAppType = (typeof LICENSE_APP_TYPES)[number];

export interface LicenseActivationContext {
  ip?: string;
  userAgent?: string;
  appType?: string | null;
  product?: LicenseAppType | null;
}

type LicenseMetadata = {
  appType: LicenseAppType;
  maxActivations: number;
};

function toHalfWidth(value: string) {
  return value
    .replace(/[\uFF01-\uFF5E]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, " ")
    .replace(/[‐‑‒–—―－]/g, "-");
}

export function normalizeLicenseKey(key: string) {
  const compact = toHalfWidth(key).trim().toUpperCase().replace(/\s+/g, "");

  if (/^AIKB[A-Z0-9]{12}$/.test(compact)) {
    return `${compact.slice(0, 4)}-${compact.slice(4, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}`;
  }

  return compact;
}

export function normalizeLicenseAppType(value: unknown, fallback: LicenseAppType = "user_app"): LicenseAppType {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "ingest" || normalized === "admin" || normalized === "admin_ingest") {
    return "ingest_admin";
  }

  if (normalized === "user" || normalized === "client") {
    return "user_app";
  }

  if (normalized === "super" || normalized === "super-admin") {
    return "super_admin";
  }

  return LICENSE_APP_TYPES.includes(normalized as LicenseAppType) ? (normalized as LicenseAppType) : fallback;
}

function getLicensePrefix(key: string) {
  const normalized = normalizeLicenseKey(key);

  if (normalized.startsWith("XT-INGEST-")) {
    return "XT-INGEST";
  }

  if (normalized.startsWith("XT-SUPER-")) {
    return "XT-SUPER";
  }

  if (normalized.startsWith("XT-USER-") || normalized.startsWith("AIKB-")) {
    return normalized.startsWith("AIKB-") ? "AIKB" : "XT-USER";
  }

  return normalized.split("-")[0] || "UNKNOWN";
}

export function inferLicenseAppTypeFromKey(key: string): LicenseAppType | null {
  const prefix = getLicensePrefix(key);

  if (prefix === "XT-INGEST") {
    return "ingest_admin";
  }

  if (prefix === "XT-SUPER") {
    return "super_admin";
  }

  if (prefix === "XT-USER" || prefix === "AIKB") {
    return "user_app";
  }

  return null;
}

export function getLicenseAppTypeFromKey(key: string): LicenseAppType | null {
  return inferLicenseAppTypeFromKey(key);
}

function getDatabaseRoleForLicenseAppType(appType: LicenseAppType) {
  return appType === "ingest_admin" ? INGEST_ADMIN_DB_ROLE : null;
}

function randomLicenseGroup(length: number) {
  const bytes = randomBytes(length);

  return Array.from(bytes, (byte) => LICENSE_ALPHABET[byte % LICENSE_ALPHABET.length]).join("");
}

export function generatePlainLicenseKey() {
  return `AIKB-${randomLicenseGroup(4)}-${randomLicenseGroup(4)}-${randomLicenseGroup(4)}`;
}

function getLicenseSecret() {
  const secret = process.env.LICENSE_SECRET?.trim();

  if (secret) {
    return secret;
  }

  return "aikb-license-v1-default-secret";
}

function hmacLicenseHash(key: string) {
  return createHmac("sha256", getLicenseSecret()).update(normalizeLicenseKey(key)).digest("hex");
}

function legacyStableLicenseHash(key: string) {
  return createHash("sha256").update(`aikb-license:${normalizeLicenseKey(key)}`).digest("hex");
}

function legacySessionSecretLicenseHash(key: string) {
  const secret = process.env.SESSION_SECRET?.trim();

  if (!secret) {
    return null;
  }

  return createHash("sha256").update(`${secret}:license:${normalizeLicenseKey(key)}`).digest("hex");
}

export function hashLicenseKey(key: string) {
  return hmacLicenseHash(key);
}

export function getAcceptedLicenseHashes(key: string) {
  return Array.from(
    new Set([
      hmacLicenseHash(key),
      legacyStableLicenseHash(key),
      legacySessionSecretLicenseHash(key)
    ].filter(Boolean) as string[])
  );
}

export function isValidLicenseFormat(key: string) {
  return LICENSE_KEY_PATTERN.test(normalizeLicenseKey(key));
}

export function isSupportedLicenseKeyInput(key: string) {
  const normalized = normalizeLicenseKey(key);

  return (
    LICENSE_KEY_PATTERN.test(normalized) ||
    /^XT-USER-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalized) ||
    /^XT-INGEST-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalized) ||
    /^XT-SUPER-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalized)
  );
}

async function findAcceptedLicenseKeys(keyHashes: string[]) {
  return prisma.licenseKey.findMany({
    where: {
      keyHash: {
        in: keyHashes
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readLicenseMetadata(metadata: unknown): LicenseMetadata | null {
  if (!isRecord(metadata)) {
    return null;
  }

  return {
    appType: normalizeLicenseAppType(metadata.appType),
    maxActivations: typeof metadata.maxActivations === "number" ? Math.max(1, metadata.maxActivations) : 1
  };
}

async function getLicenseMetadata(licenseId: string, fallbackAppType: LicenseAppType = "user_app"): Promise<LicenseMetadata> {
  const auditLog = await prisma.auditLog.findFirst({
    where: {
      action: {
        in: LICENSE_METADATA_ACTIONS
      },
      targetType: "license_key",
      targetId: licenseId
    },
    orderBy: {
      createdAt: "desc"
    },
    select: {
      metadata: true
    }
  });

  return readLicenseMetadata(auditLog?.metadata) ?? {
    appType: fallbackAppType,
    maxActivations: 1
  };
}

async function getLatestRedeemedLicenseAppType(userId: string): Promise<LicenseAppType | null> {
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

  return (await getLicenseMetadata(license.id)).appType;
}

async function recordLicenseAuditLog(input: {
  userId: string | null;
  action: string;
  targetId?: string | null;
  context?: LicenseActivationContext;
  metadata?: Record<string, unknown>;
}) {
  await prisma.auditLog
    .create({
      data: {
        userId: input.userId,
        role: null,
        action: input.action,
        targetType: "license_key",
        targetId: input.targetId ?? null,
        ip: input.context?.ip,
        userAgent: input.context?.userAgent,
        metadata: input.metadata as Prisma.InputJsonObject | undefined
      }
    })
    .catch(() => undefined);
}

async function createAdminBootstrapLicenseIfAllowed(userId: string, key: string) {
  if (!isValidLicenseFormat(key)) {
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      phone: true
    }
  });

  if (!user || !isLicenseBootstrapAdmin(user)) {
    return;
  }

  await prisma.licenseKey
    .create({
      data: {
        keyHash: hashLicenseKey(key),
        status: LicenseKeyStatus.UNUSED
      }
    })
    .catch(() => null);
}

function readCsvEnv(name: string) {
  return (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function readPhoneEnv(name: string) {
  return (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map(normalizePhone);
}

function isLicenseBootstrapAdmin(user: { id: string; phone: string | null }) {
  const userIds = readCsvEnv("ADMIN_USER_IDS");
  const phones = new Set([...BOOTSTRAP_ADMIN_PHONES, ...readPhoneEnv("ADMIN_PHONES")]);

  return userIds.includes(user.id.trim().toLowerCase()) || (user.phone ? phones.has(normalizePhone(user.phone)) : false);
}

async function recordActivationLog(input: {
  codeHash: string;
  userId: string;
  success: boolean;
  message: string;
  context?: LicenseActivationContext;
}) {
  await prisma.activationLog
    .create({
      data: {
        codeHash: input.codeHash,
        userId: input.userId,
        success: input.success,
        message: input.message,
        ip: input.context?.ip,
        userAgent: input.context?.userAgent
      }
    })
    .catch(() => undefined);
}

export async function checkUserLicense(userId: string, requiredAppType?: LicenseAppType) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      licenseActivated: true,
      isActive: true,
      phone: true,
      role: true
    }
  });

  if (!user) {
    throw new NotFoundError("用户不存在。");
  }

  if (!user.isActive) {
    throw new ForbiddenError("账号已禁用。");
  }

  const bootstrapSuperAdmin = isBootstrapSuperAdminUser(user);

  if (!user.licenseActivated) {
    if (bootstrapSuperAdmin && (!requiredAppType || requiredAppType === "super_admin")) {
      return true;
    }

    throw new LicenseRequiredError("请先输入卡密激活知识库。");
  }

  if (!requiredAppType) {
    return true;
  }

  if (requiredAppType === "super_admin") {
    if (bootstrapSuperAdmin) {
      return true;
    }

    throw new LicenseAppTypeMismatchError("超级管理员账号不通过普通卡密激活。");
  }

  const licenseAppType = await getLatestRedeemedLicenseAppType(userId);
  const role = user.role;

  if (requiredAppType === "ingest_admin") {
    const roleAllowed = role === "ingest_admin" || role === "kb_admin" || role === "enterprise_admin";

    if (!roleAllowed || licenseAppType !== "ingest_admin") {
      await recordLicenseAuditLog({
        userId,
        action: "license.mismatch",
        metadata: {
          requiredAppType,
          licenseAppType,
          role,
          source: "check_user_license"
        }
      });
      throw new LicenseAppTypeMismatchError("投喂端必须使用 XT-INGEST 卡密激活。");
    }
  }

  if (requiredAppType === "user_app") {
    if (role !== "user" || (licenseAppType && licenseAppType !== "user_app")) {
      await recordLicenseAuditLog({
        userId,
        action: "license.mismatch",
        metadata: {
          requiredAppType,
          licenseAppType,
          role,
          source: "check_user_license"
        }
      });
      throw new LicenseAppTypeMismatchError("用户端必须使用 XT-USER 卡密激活。");
    }
  }

  return true;
}

export async function redeemLicenseKey(userId: string, key: string, context?: LicenseActivationContext) {
  if (!isSupportedLicenseKeyInput(key)) {
    await recordLicenseAuditLog({
      userId,
      action: "license_invalid",
      context,
      metadata: {
        appType: normalizeLicenseAppType(context?.appType),
        reason: "unsupported_format"
      }
    });
    throw new InvalidLicenseKeyError("卡密格式无效。");
  }

  const keyAppType = getLicenseAppTypeFromKey(key);
  const requestedAppType = normalizeLicenseAppType(context?.appType, keyAppType ?? "user_app");
  const licensePrefix = getLicensePrefix(key);
  const keyHashes = getAcceptedLicenseHashes(key);
  const primaryHash = hashLicenseKey(key);
  let licenses = await findAcceptedLicenseKeys(keyHashes);

  if (requestedAppType === "super_admin" || keyAppType === "super_admin") {
    await recordLicenseAuditLog({
      userId,
      action: "license.mismatch",
      context,
      metadata: {
        requestedAppType,
        keyAppType,
        reason: "super_admin_license_redeem_blocked"
      }
    });
    throw new LicenseAppTypeMismatchError("超级管理员账号不通过普通卡密激活。");
  }

  if (keyAppType && keyAppType !== requestedAppType) {
    await recordLicenseAuditLog({
      userId,
      action: "license.mismatch",
      context,
      metadata: {
        requestedAppType,
        keyAppType,
        reason: "license_key_prefix_mismatch"
      }
    });
    throw new LicenseAppTypeMismatchError("卡密不适用于当前客户端。");
  }

  if (licenses.length === 0) {
    await createAdminBootstrapLicenseIfAllowed(userId, key);
    licenses = await findAcceptedLicenseKeys(keyHashes);

    if (licenses.length === 0) {
      console.info("[ingest:activate-license]", {
        userId,
        appType: requestedAppType,
        licensePrefix,
        foundLicense: false,
        status: null,
        redeemedByUserId: "empty",
        expiresAt: null
      });
      await recordActivationLog({
        codeHash: primaryHash,
        userId,
        success: false,
        message: "卡密不存在。",
        context
      });
      await recordLicenseAuditLog({
        userId,
        action: "license_invalid",
        context,
        metadata: {
          appType: requestedAppType,
          reason: "not_found",
          codeHash: primaryHash
        }
      });
      throw new LicenseNotFoundError("卡密不存在。");
    }
  }

  const license = licenses.find((item) => item.status === LicenseKeyStatus.UNUSED) ?? licenses[0];
  const metadata = await getLicenseMetadata(license.id, keyAppType ?? requestedAppType);

  console.info("[ingest:activate-license]", {
    userId,
    appType: requestedAppType,
    licensePrefix,
    foundLicense: Boolean(license),
    status: license?.status,
    redeemedByUserId: license?.redeemedByUserId ? "present" : "empty",
    expiresAt: license?.expiresAt
  });

  if (metadata.appType !== requestedAppType) {
    await recordActivationLog({
      codeHash: primaryHash,
      userId,
      success: false,
      message: "卡密不适用于当前客户端。",
      context
    });
    await recordLicenseAuditLog({
      userId,
      action: "license_app_type_mismatch",
      targetId: license.id,
      context,
      metadata: {
        requestedAppType,
        licenseAppType: metadata.appType
      }
    });
    throw new LicenseAppTypeMismatchError("卡密不适用于当前客户端。");
  }

  if (licenses.some((item) => item.status === LicenseKeyStatus.USED)) {
    await recordActivationLog({
      codeHash: primaryHash,
      userId,
      success: false,
      message: "卡密已使用。",
      context
    });
    await recordLicenseAuditLog({
      userId,
      action: "license_activation_limit_reached",
      targetId: license.id,
      context,
      metadata: {
        requestedAppType,
        maxActivations: metadata.maxActivations,
        activationCount: 1
      }
    });
    throw new LicenseActivationLimitReachedError("卡密已使用。");
  }

  if (licenses.every((license) => license.status === LicenseKeyStatus.DISABLED)) {
    await recordActivationLog({
      codeHash: primaryHash,
      userId,
      success: false,
      message: "卡密已禁用。",
      context
    });
    await recordLicenseAuditLog({
      userId,
      action: "disable_license_key",
      targetId: license.id,
      context,
      metadata: {
        requestedAppType,
        reason: "redeem_disabled_license"
      }
    });
    throw new LicenseDisabledError("卡密已禁用。");
  }

  if (license.status === LicenseKeyStatus.DISABLED) {
    await recordActivationLog({
      codeHash: primaryHash,
      userId,
      success: false,
      message: "卡密已禁用。",
      context
    });
    await recordLicenseAuditLog({
      userId,
      action: "disable_license_key",
      targetId: license.id,
      context,
      metadata: {
        requestedAppType,
        reason: "redeem_disabled_license"
      }
    });
    throw new LicenseDisabledError("卡密已禁用。");
  }

  if (license.expiresAt && license.expiresAt <= new Date()) {
    await recordActivationLog({
      codeHash: primaryHash,
      userId,
      success: false,
      message: "卡密已过期。",
      context
    });
    await recordLicenseAuditLog({
      userId,
      action: "license_expired",
      targetId: license.id,
      context,
      metadata: {
        requestedAppType,
        expiresAt: license.expiresAt.toISOString()
      }
    });
    throw new LicenseExpiredError("卡密已过期。");
  }

  const dbRole = getDatabaseRoleForLicenseAppType(requestedAppType);

  const redeemedUser = await prisma.$transaction(async (tx) => {
    const updatedLicense = await tx.licenseKey.updateMany({
      where: {
        id: license.id,
        status: LicenseKeyStatus.UNUSED,
        redeemedByUserId: null
      },
      data: {
        status: LicenseKeyStatus.USED,
        redeemedByUserId: userId,
        redeemedAt: new Date()
      }
    });

    if (updatedLicense.count !== 1) {
      await recordActivationLog({
        codeHash: primaryHash,
        userId,
        success: false,
        message: "卡密已使用。",
        context
      });
      throw new LicenseActivationLimitReachedError("卡密已使用。");
    }

    const user = await tx.user.update({
      where: { id: userId },
      data: {
        licenseActivated: true,
        isActive: true,
        ...(dbRole ? { role: dbRole } : {})
      },
      select: {
        id: true,
        phone: true,
        licenseActivated: true
      }
    });

    return user;
  });

  if (dbRole) {
    try {
      const activeAssignment = await prisma.userRoleAssignment.findFirst({
        where: {
          userId,
          role: dbRole,
          revokedAt: null,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        },
        select: {
          id: true
        }
      });

      if (!activeAssignment) {
        await prisma.userRoleAssignment.create({
          data: {
            userId,
            role: dbRole
          }
        });
      }
    } catch (error) {
      const value = error as { code?: unknown; message?: unknown };

      console.warn("[ingest:activate-license:role-assignment-skipped]", {
        userId,
        appType: requestedAppType,
        dbRole,
        errorCode: typeof value?.code === "string" ? value.code : "unknown",
        message: typeof value?.message === "string" ? value.message.slice(0, 160) : "unknown"
      });
    }
  }

  await recordActivationLog({
    codeHash: primaryHash,
    userId,
    success: true,
    message: "激活成功。",
    context
  });
  await recordLicenseAuditLog({
    userId,
    action: "redeem_license_key",
    targetId: license.id,
    context,
    metadata: {
      requestedAppType,
      dbRole,
      licenseAppType: metadata.appType,
      maxActivations: metadata.maxActivations,
      activationCount: 1
    }
  });

  return redeemedUser;
}
