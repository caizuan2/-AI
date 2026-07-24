import { LicenseKeyStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess, databaseConfigError, sessionConfigError } from "@/lib/api-response";
import { createSession, type AppUser } from "@/lib/auth";
import {
  getAcceptedLicenseHashes,
  getLicenseAppTypeFromKey,
  isSupportedLicenseKeyInput,
  normalizeLicenseKey,
  redeemLicenseKey
} from "@/lib/auth/license";
import { hashPassword } from "@/lib/auth/password";
import { ensureRegistrationSchema } from "@/lib/db/registration-schema";
import {
  AppError,
  InvalidLicenseKeyError,
  LicenseAppTypeMismatchError,
  RateLimitError,
  ValidationError
} from "@/lib/errors";
import { parseIngestRegisterRequest } from "@/lib/enterprise/ingest-auth-credentials";
import { setIngestPortalCookie, toIngestAuthUser } from "@/lib/enterprise/ingest-auth-session";
import { checkPersistentRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { hasDatabaseUrl, hasSessionSecret } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getRequestIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
}

function assertIngestLicenseKey(licenseKey: string) {
  const normalizedLicenseKey = normalizeLicenseKey(licenseKey);

  if (!isSupportedLicenseKeyInput(normalizedLicenseKey)) {
    throw new InvalidLicenseKeyError("卡密格式无效。");
  }

  if (getLicenseAppTypeFromKey(normalizedLicenseKey) !== "ingest_admin") {
    throw new LicenseAppTypeMismatchError("卡密不属于投喂版。");
  }

  return normalizedLicenseKey;
}

async function registrationActivationCompleted(userId: string, licenseKey: string) {
  const [user, license] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        isActive: true,
        licenseActivated: true
      }
    }),
    prisma.licenseKey.findFirst({
      where: {
        keyHash: {
          in: getAcceptedLicenseHashes(licenseKey)
        },
        status: LicenseKeyStatus.USED,
        redeemedByUserId: userId
      },
      select: {
        id: true
      }
    })
  ]);

  return Boolean(user?.isActive && user.licenseActivated && license);
}

export async function POST(request: Request) {
  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("注册投喂账号"));
  }

  if (!hasSessionSecret()) {
    return apiError(sessionConfigError("注册投喂账号"));
  }

  let input: ReturnType<typeof parseIngestRegisterRequest>;

  try {
    input = parseIngestRegisterRequest(await request.json());
  } catch (error) {
    return apiError(error instanceof Error ? error : new ValidationError("请求体必须是合法 JSON。"));
  }

  const rateLimit = await checkPersistentRateLimit(request, {
    namespace: "ingest-auth-register-activation",
    limit: 5,
    windowMs: 15 * 60_000,
    globalLimit: 200
  });

  if (!rateLimit.allowed) {
    return apiError(
      new RateLimitError(`注册激活尝试过于频繁，请 ${rateLimit.retryAfterSeconds} 秒后再试。`),
      { headers: rateLimitHeaders(rateLimit) }
    );
  }

  try {
    const normalizedLicenseKey = assertIngestLicenseKey(input.licenseKey);
    const schema = await ensureRegistrationSchema();

    if (!schema.ready) {
      throw new AppError("DATABASE_ERROR", "数据库表结构未就绪，请联系管理员。", 500);
    }

    const existing = await prisma.user.findUnique({
      where: { phone: input.phone },
      select: { id: true }
    });

    if (existing) {
      throw new AppError("VALIDATION_ERROR", "该手机号已注册，请直接登录。", 409);
    }

    const user = await prisma.user.create({
      data: {
        phone: input.phone,
        passwordHash: await hashPassword(input.password),
        name: input.name,
        isActive: false,
        licenseActivated: false
      },
      select: {
        id: true,
        email: true,
        phone: true,
        name: true,
        isActive: true,
        licenseActivated: true
      }
    });
    let licenseActivated = false;

    try {
      const activatedUser = await redeemLicenseKey(user.id, normalizedLicenseKey, {
        appType: "ingest_admin",
        ip: getRequestIp(request),
        userAgent: request.headers.get("user-agent") ?? undefined
      });
      licenseActivated = activatedUser.licenseActivated;
    } catch (error) {
      licenseActivated = await registrationActivationCompleted(user.id, normalizedLicenseKey);

      if (!licenseActivated) {
        await prisma.user.delete({
          where: { id: user.id }
        });
        throw error;
      }
    }

    const activatedAccount = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        phone: true,
        name: true,
        isActive: true,
        licenseActivated: true
      }
    });
    const session = await createSession(user.id, request);
    const appUser: AppUser = {
      ...activatedAccount,
      name: activatedAccount.name?.trim() || activatedAccount.phone,
      licenseActivated
    };

    await setIngestPortalCookie(appUser, request);
    const authUser = await toIngestAuthUser(appUser);

    return apiSuccess({
      success: true,
      sessionToken: session.token,
      licenseActivated: authUser.licenseActivated,
      hasIngestAccess: authUser.licenseActivated,
      redirectTarget: "/admin-ingest?app=ingest-admin&platform=web",
      user: {
        ...authUser,
        hasIngestAccess: authUser.licenseActivated
      }
    }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
