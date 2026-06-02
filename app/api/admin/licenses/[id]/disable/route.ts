import { LicenseKeyStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminUser } from "@/lib/admin";
import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { hasDatabaseUrl } from "@/lib/server-config";

export const dynamic = "force-dynamic";

interface DisableLicenseResponse {
  id: string;
  status: LicenseKeyStatus;
}

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdminUser();
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("禁用卡密"));
  }

  try {
    const license = await prisma.licenseKey.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        status: true
      }
    });

    if (!license) {
      return apiError(new NotFoundError("卡密不存在。"));
    }

    if (license.status === LicenseKeyStatus.USED) {
      return apiError(new ForbiddenError("已使用卡密不能禁用。"));
    }

    const updated = await prisma.licenseKey.update({
      where: { id: params.id },
      data: { status: LicenseKeyStatus.DISABLED },
      select: {
        id: true,
        status: true
      }
    });

    return apiSuccess<DisableLicenseResponse>(updated);
  } catch (error) {
    return apiError(error);
  }
}
