import { LicenseKeyStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import {
  getAcceptedLicenseHashes,
  getLicenseAppTypeFromKey,
  isSupportedLicenseKeyInput,
  normalizeLicenseKey
} from "@/lib/auth/license";
import { getUserAccessProfile, hasUserClientAccess } from "@/lib/auth/access-control";
import { hashPassword } from "@/lib/auth/password";
import { parsePasswordResetRequest } from "@/lib/auth/password-reset";
import { RateLimitError, UnauthorizedError, ValidationError } from "@/lib/errors";
import { checkPersistentRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { hasDatabaseUrl } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ResetPasswordResponse {
  reset: true;
}

const RESET_FAILED_MESSAGE = "手机号或卡密验证失败，请检查后重试。";

function resetUnauthorized() {
  return new UnauthorizedError(RESET_FAILED_MESSAGE);
}

export async function POST(request: Request) {
  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("重置密码"));
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError(new ValidationError("请求体必须是合法 JSON。"));
  }

  let input: ReturnType<typeof parsePasswordResetRequest>;

  try {
    input = parsePasswordResetRequest(body);
  } catch (error) {
    return apiError(error);
  }

  const rateLimit = await checkPersistentRateLimit(request, {
    namespace: "auth-password-reset",
    limit: 5,
    windowMs: 15 * 60_000,
    globalLimit: 200
  });

  if (!rateLimit.allowed) {
    return apiError(
      new RateLimitError(`密码重置尝试过于频繁，请 ${rateLimit.retryAfterSeconds} 秒后再试。`),
      { headers: rateLimitHeaders(rateLimit) }
    );
  }

  try {
    const normalizedLicenseKey = normalizeLicenseKey(input.licenseKey);
    const isUserLicense =
      isSupportedLicenseKeyInput(normalizedLicenseKey) &&
      getLicenseAppTypeFromKey(normalizedLicenseKey) === "user_app";
    const [user, license] = await Promise.all([
      prisma.user.findUnique({
        where: {
          phone: input.phone
        },
        select: {
          id: true,
          phone: true,
          isActive: true,
          licenseActivated: true
        }
      }),
      prisma.licenseKey.findFirst({
        where: {
          keyHash: {
            in: getAcceptedLicenseHashes(normalizedLicenseKey)
          },
          status: LicenseKeyStatus.USED,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        },
        select: {
          id: true,
          redeemedByUserId: true
        }
      })
    ]);

    if (
      !user ||
      !user.isActive ||
      !isUserLicense ||
      !license ||
      license.redeemedByUserId !== user.id
    ) {
      throw resetUnauthorized();
    }

    const accessProfile = await getUserAccessProfile(user);

    if (!hasUserClientAccess(accessProfile)) {
      throw resetUnauthorized();
    }

    const passwordHash = await hashPassword(input.newPassword);

    await prisma.user.update({
      where: {
        id: user.id
      },
      data: {
        passwordHash
      }
    });

    return apiSuccess<ResetPasswordResponse>({ reset: true });
  } catch (error) {
    return apiError(error);
  }
}
