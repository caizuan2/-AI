import { prisma } from "@/lib/prisma";
import { requireAdminUser } from "@/lib/admin";
import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import {
  getAcceptedLicenseHashes,
  hashLicenseKey,
  normalizeLicenseKey
} from "@/lib/auth/license";
import { ValidationError } from "@/lib/errors";
import { hasDatabaseUrl } from "@/lib/server-config";

export const dynamic = "force-dynamic";

interface CheckCodeResponse {
  normalized_code: string;
  code_hash_prefix: string;
  exists: boolean;
  status: "unused" | "used" | "disabled" | "expired" | "missing";
  expires_at: string | null;
  used_by: string | null;
  used_at: string | null;
}

function parseCheckCodeRequest(body: unknown) {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";

  if (!code) {
    throw new ValidationError("请输入卡密。");
  }

  return { code };
}

export async function POST(request: Request) {
  try {
    await requireAdminUser();
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("调试卡密"));
  }

  try {
    const body = await request.json().catch(() => null);
    const input = parseCheckCodeRequest(body);
    const normalized = normalizeLicenseKey(input.code);
    const codeHash = hashLicenseKey(input.code);
    const acceptedHashes = getAcceptedLicenseHashes(input.code);
    const license = await prisma.licenseKey.findFirst({
      where: {
        keyHash: {
          in: acceptedHashes
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    if (!license) {
      return apiSuccess<CheckCodeResponse>({
        normalized_code: normalized,
        code_hash_prefix: codeHash.slice(0, 12),
        exists: false,
        status: "missing",
        expires_at: null,
        used_by: null,
        used_at: null
      });
    }

    const expired = Boolean(license.expiresAt && license.expiresAt <= new Date());

    return apiSuccess<CheckCodeResponse>({
      normalized_code: normalized,
      code_hash_prefix: codeHash.slice(0, 12),
      exists: true,
      status: expired ? "expired" : license.status.toLowerCase() as CheckCodeResponse["status"],
      expires_at: license.expiresAt?.toISOString() ?? null,
      used_by: license.redeemedByUserId,
      used_at: license.redeemedAt?.toISOString() ?? null
    });
  } catch (error) {
    return apiError(error);
  }
}
