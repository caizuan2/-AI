import { createHash, randomBytes } from "crypto";
import { LicenseKeyStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAdminUser } from "@/lib/admin";
import { ForbiddenError, LicenseRequiredError, NotFoundError } from "@/lib/errors";

const LICENSE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LICENSE_KEY_PATTERN = /^AIKB-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

function normalizeLicenseKey(key: string) {
  return key.trim().toUpperCase().replace(/\s+/g, "");
}

function randomLicenseGroup(length: number) {
  const bytes = randomBytes(length);

  return Array.from(bytes, (byte) => LICENSE_ALPHABET[byte % LICENSE_ALPHABET.length]).join("");
}

export function generatePlainLicenseKey() {
  return `AIKB-${randomLicenseGroup(4)}-${randomLicenseGroup(4)}-${randomLicenseGroup(4)}`;
}

function stableLicenseHash(key: string) {
  return createHash("sha256").update(`aikb-license:${normalizeLicenseKey(key)}`).digest("hex");
}

function sessionSecretLicenseHash(key: string) {
  const secret = process.env.SESSION_SECRET?.trim();

  if (!secret) {
    return null;
  }

  return createHash("sha256").update(`${secret}:license:${normalizeLicenseKey(key)}`).digest("hex");
}

export function hashLicenseKey(key: string) {
  return stableLicenseHash(key);
}

function getAcceptedLicenseHashes(key: string) {
  return Array.from(new Set([stableLicenseHash(key), sessionSecretLicenseHash(key)].filter(Boolean) as string[]));
}

function isValidLicenseFormat(key: string) {
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

  if (!user || !isAdminUser(user)) {
    return;
  }

  await prisma.licenseKey
    .create({
      data: {
        keyHash: stableLicenseHash(key),
        status: LicenseKeyStatus.UNUSED
      }
    })
    .catch(() => null);
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

export async function redeemLicenseKey(userId: string, key: string) {
  const keyHashes = getAcceptedLicenseHashes(key);
  let licenses = await findAcceptedLicenseKeys(keyHashes);

  if (licenses.length === 0) {
    await createAdminBootstrapLicenseIfAllowed(userId, key);
    licenses = await findAcceptedLicenseKeys(keyHashes);

    if (licenses.length === 0) {
      throw new NotFoundError("卡密不存在。");
    }
  }

  if (licenses.some((license) => license.status === LicenseKeyStatus.USED)) {
    throw new ForbiddenError("卡密已使用。");
  }

  if (licenses.every((license) => license.status === LicenseKeyStatus.DISABLED)) {
    throw new ForbiddenError("卡密已禁用。");
  }

  const license = licenses.find((item) => item.status === LicenseKeyStatus.UNUSED) ?? licenses[0];

  if (license.status === LicenseKeyStatus.DISABLED) {
    throw new ForbiddenError("卡密已禁用。");
  }

  if (license.expiresAt && license.expiresAt <= new Date()) {
    throw new ForbiddenError("卡密已过期。");
  }

  return prisma.$transaction(async (tx) => {
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
}
