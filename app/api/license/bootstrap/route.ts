import { LicenseKeyStatus } from "@prisma/client";
import { apiError, apiSuccess, databaseConfigError, sessionConfigError } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { generatePlainLicenseKey, hashLicenseKey } from "@/lib/auth/license";
import { ensureRegistrationSchema } from "@/lib/db/registration-schema";
import { AppError, ForbiddenError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { hasDatabaseUrl, hasSessionSecret } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BootstrapLicenseResponse {
  licenseKey: string;
}

export async function POST() {
  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("生成首张卡密"));
  }

  if (!hasSessionSecret()) {
    return apiError(sessionConfigError("生成首张卡密"));
  }

  try {
    const user = await requireUser();

    if (user.licenseActivated) {
      return apiError(new ForbiddenError("当前账号已激活，无需领取卡密。"));
    }

    const schema = await ensureRegistrationSchema();

    if (!schema.ready) {
      return apiError(new AppError(
        "DATABASE_ERROR",
        "数据库表结构自动补齐失败，无法生成卡密。",
        500
      ));
    }

    const existingCount = await prisma.licenseKey.count();

    if (existingCount > 0) {
      return apiError(new ForbiddenError("系统已存在卡密，请联系管理员领取。"));
    }

    const licenseKey = generatePlainLicenseKey();

    await prisma.licenseKey.create({
      data: {
        keyHash: hashLicenseKey(licenseKey),
        status: LicenseKeyStatus.UNUSED
      },
      select: { id: true }
    });

    return apiSuccess<BootstrapLicenseResponse>({ licenseKey }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
