import { createHash } from "crypto";
import { LicenseKeyStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ConfigError, ForbiddenError, LicenseRequiredError, NotFoundError } from "@/lib/errors";

function normalizeLicenseKey(key: string) {
  return key.trim().toUpperCase().replace(/\s+/g, "");
}

export function hashLicenseKey(key: string) {
  const secret = process.env.SESSION_SECRET?.trim();

  if (!secret) {
    throw new ConfigError("认证密钥未配置，无法校验卡密。请在 Netlify 设置 SESSION_SECRET。");
  }

  return createHash("sha256").update(`${secret}:license:${normalizeLicenseKey(key)}`).digest("hex");
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
  const keyHash = hashLicenseKey(key);
  const license = await prisma.licenseKey.findUnique({
    where: { keyHash }
  });

  if (!license) {
    throw new NotFoundError("卡密不存在。");
  }

  if (license.status === LicenseKeyStatus.DISABLED) {
    throw new ForbiddenError("卡密已禁用。");
  }

  if (license.status === LicenseKeyStatus.USED) {
    throw new ForbiddenError("卡密已使用。");
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
