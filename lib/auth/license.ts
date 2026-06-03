import { createHash, createHmac, randomBytes } from "crypto";
import { LicenseKeyStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/auth/phone";
import { ForbiddenError, LicenseRequiredError, NotFoundError } from "@/lib/errors";

const LICENSE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LICENSE_KEY_PATTERN = /^AIKB-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const BOOTSTRAP_ADMIN_PHONES = ["+8613352833602"];

export interface LicenseActivationContext {
  ip?: string;
  userAgent?: string;
}

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

export async function checkUserLicense(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      licenseActivated: true,
      isActive: true
    }
  });

  if (!user) {
    throw new NotFoundError("用户不存在。");
  }

  if (!user.isActive) {
    throw new ForbiddenError("账号已禁用。");
  }

  if (!user.licenseActivated) {
    throw new LicenseRequiredError("请先输入卡密激活知识库。");
  }

  return true;
}

export async function redeemLicenseKey(userId: string, key: string, context?: LicenseActivationContext) {
  const keyHashes = getAcceptedLicenseHashes(key);
  const primaryHash = hashLicenseKey(key);
  let licenses = await findAcceptedLicenseKeys(keyHashes);

  if (licenses.length === 0) {
    await createAdminBootstrapLicenseIfAllowed(userId, key);
    licenses = await findAcceptedLicenseKeys(keyHashes);

    if (licenses.length === 0) {
      await recordActivationLog({
        codeHash: primaryHash,
        userId,
        success: false,
        message: "卡密不存在。",
        context
      });
      throw new NotFoundError("卡密不存在。");
    }
  }

  if (licenses.some((license) => license.status === LicenseKeyStatus.USED)) {
    await recordActivationLog({
      codeHash: primaryHash,
      userId,
      success: false,
      message: "卡密已使用。",
      context
    });
    throw new ForbiddenError("卡密已使用。");
  }

  if (licenses.every((license) => license.status === LicenseKeyStatus.DISABLED)) {
    await recordActivationLog({
      codeHash: primaryHash,
      userId,
      success: false,
      message: "卡密已禁用。",
      context
    });
    throw new ForbiddenError("卡密已禁用。");
  }

  const license = licenses.find((item) => item.status === LicenseKeyStatus.UNUSED) ?? licenses[0];

  if (license.status === LicenseKeyStatus.DISABLED) {
    await recordActivationLog({
      codeHash: primaryHash,
      userId,
      success: false,
      message: "卡密已禁用。",
      context
    });
    throw new ForbiddenError("卡密已禁用。");
  }

  if (license.expiresAt && license.expiresAt <= new Date()) {
    await recordActivationLog({
      codeHash: primaryHash,
      userId,
      success: false,
      message: "卡密已过期。",
      context
    });
    throw new ForbiddenError("卡密已过期。");
  }

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
      throw new ForbiddenError("卡密已使用。");
    }

    const user = await tx.user.update({
      where: { id: userId },
      data: {
        licenseActivated: true
      },
      select: {
        id: true,
        phone: true,
        licenseActivated: true
      }
    });

    return user;
  });

  await recordActivationLog({
    codeHash: primaryHash,
    userId,
    success: true,
    message: "激活成功。",
    context
  });

  return redeemedUser;
}
