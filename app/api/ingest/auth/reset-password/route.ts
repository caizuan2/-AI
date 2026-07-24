import { LicenseKeyStatus } from "@prisma/client";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import {
  getAcceptedLicenseHashes,
  getLicenseAppTypeFromKey,
  hasRedeemedLicenseForAppType,
  isSupportedLicenseKeyInput,
  normalizeLicenseKey
} from "@/lib/auth/license";
import { hashPassword } from "@/lib/auth/password";
import { resolveSessionCookieSecure } from "@/lib/auth/session-cookie";
import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { RateLimitError, UnauthorizedError, ValidationError } from "@/lib/errors";
import { parseIngestPasswordResetRequest } from "@/lib/enterprise/ingest-auth-credentials";
import { INGEST_PORTAL_COOKIE_NAME } from "@/lib/enterprise/ingest-portal-cookie";
import { prisma } from "@/lib/prisma";
import { checkPersistentRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { hasDatabaseUrl } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESET_FAILED_MESSAGE = "手机号或投喂端卡密验证失败，请检查后重试。";

function resetUnauthorized() {
  return new UnauthorizedError(RESET_FAILED_MESSAGE);
}

export async function POST(request: Request) {
  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("重置投喂端密码"));
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError(new ValidationError("请求体必须是合法 JSON。"));
  }

  let input: ReturnType<typeof parseIngestPasswordResetRequest>;

  try {
    input = parseIngestPasswordResetRequest(body);
  } catch (error) {
    return apiError(error);
  }

  const rateLimit = await checkPersistentRateLimit(request, {
    namespace: "ingest-auth-password-reset",
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
    const isIngestLicense =
      isSupportedLicenseKeyInput(normalizedLicenseKey) &&
      getLicenseAppTypeFromKey(normalizedLicenseKey) === "ingest_admin";
    const [user, license] = await Promise.all([
      prisma.user.findUnique({
        where: {
          phone: input.phone
        },
        select: {
          id: true,
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
      !user.licenseActivated ||
      !isIngestLicense ||
      !license ||
      license.redeemedByUserId !== user.id ||
      !(await hasRedeemedLicenseForAppType(user.id, "ingest_admin"))
    ) {
      throw resetUnauthorized();
    }

    const passwordHash = await hashPassword(input.newPassword);

    await prisma.$transaction([
      prisma.user.update({
        where: {
          id: user.id
        },
        data: {
          passwordHash
        }
      }),
      prisma.session.deleteMany({
        where: {
          userId: user.id
        }
      })
    ]);

    const response = apiSuccess({
      reset: true,
      sessionsRevoked: true
    });
    const cookieOptions = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: resolveSessionCookieSecure(request),
      path: "/",
      maxAge: 0
    };

    response.cookies.set(SESSION_COOKIE_NAME, "", cookieOptions);
    response.cookies.set(INGEST_PORTAL_COOKIE_NAME, "", cookieOptions);

    return response;
  } catch (error) {
    return apiError(error);
  }
}
