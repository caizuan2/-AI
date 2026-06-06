import { LicenseKeyStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminUser } from "@/lib/admin";
import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit-log";
import { isPlainObject } from "@/lib/api/responses";
import { generatePlainLicenseKey, hashLicenseKey } from "@/lib/auth/license";
import { ValidationError } from "@/lib/errors";
import { hasDatabaseUrl } from "@/lib/server-config";

export const dynamic = "force-dynamic";

interface AdminLicenseResponse {
  id: string;
  status: LicenseKeyStatus;
  redeemedByUserId: string | null;
  redeemedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface ListAdminLicensesResponse {
  licenses: AdminLicenseResponse[];
}

interface GenerateAdminLicensesResponse {
  codes: string[];
  expiresAt: string | null;
}

function serializeLicense(license: {
  id: string;
  status: LicenseKeyStatus;
  redeemedByUserId: string | null;
  redeemedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}): AdminLicenseResponse {
  return {
    id: license.id,
    status: license.status,
    redeemedByUserId: license.redeemedByUserId,
    redeemedAt: license.redeemedAt?.toISOString() ?? null,
    expiresAt: license.expiresAt?.toISOString() ?? null,
    createdAt: license.createdAt.toISOString()
  };
}

function parseGenerateRequest(body: unknown) {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const count = Number(body.count ?? 1);
  const expiresAtRaw = typeof body.expiresAt === "string" ? body.expiresAt.trim() : "";

  if (!Number.isInteger(count) || count < 1 || count > 5000) {
    throw new ValidationError("单次生成数量必须在 1 到 5000 之间。");
  }

  let expiresAt: Date | null = null;

  if (expiresAtRaw) {
    const date = new Date(`${expiresAtRaw}T23:59:59.999Z`);

    if (Number.isNaN(date.getTime())) {
      throw new ValidationError("有效期日期格式不正确。");
    }

    expiresAt = date;
  }

  return { count, expiresAt };
}

export async function GET(request: Request) {
  let admin: Awaited<ReturnType<typeof requireAdminUser>>;

  try {
    admin = await requireAdminUser(request);
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("读取卡密"));
  }

  try {
    const licenses = await prisma.licenseKey.findMany({
      orderBy: { createdAt: "desc" },
      take: 500
    });

    await writeAuditLog({
      userId: admin.id,
      role: admin.role,
      action: "ADMIN_LICENSE_VIEW",
      targetType: "license_key",
      request,
      metadata: {
        resultCount: licenses.length
      }
    });

    return apiSuccess<ListAdminLicensesResponse>({
      licenses: licenses.map(serializeLicense)
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  let admin: Awaited<ReturnType<typeof requireAdminUser>>;

  try {
    admin = await requireAdminUser(request);
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("生成卡密"));
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError(new ValidationError("请求体必须是合法 JSON。"));
  }

  let input: ReturnType<typeof parseGenerateRequest>;

  try {
    input = parseGenerateRequest(body);
  } catch (error) {
    return apiError(error);
  }

  try {
    const codes = new Set<string>();

    while (codes.size < input.count) {
      codes.add(generatePlainLicenseKey());
    }

    await prisma.licenseKey.createMany({
      data: Array.from(codes, (code) => ({
        keyHash: hashLicenseKey(code),
        status: LicenseKeyStatus.UNUSED,
        expiresAt: input.expiresAt
      })),
      skipDuplicates: true
    });

    await writeAuditLog({
      userId: admin.id,
      role: admin.role,
      action: "ADMIN_LICENSE_GENERATE",
      targetType: "license_key",
      request,
      metadata: {
        count: codes.size,
        expiresAt: input.expiresAt?.toISOString() ?? null
      }
    });

    return apiSuccess<GenerateAdminLicensesResponse>({
      codes: Array.from(codes),
      expiresAt: input.expiresAt?.toISOString() ?? null
    });
  } catch (error) {
    return apiError(error);
  }
}
