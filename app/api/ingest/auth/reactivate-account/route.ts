import { LicenseKeyStatus } from "@prisma/client";
import { createSession, type AppUser } from "@/lib/auth";
import {
  getAcceptedLicenseHashes,
  getLicenseAppTypeFromKey,
  hasUserRedeemedLicenseHistoryForAppType,
  isSupportedLicenseKeyInput,
  normalizeLicenseKey,
  redeemLicenseKey
} from "@/lib/auth/license";
import { apiError, apiSuccess, databaseConfigError, sessionConfigError } from "@/lib/api-response";
import { AppError, RateLimitError, UnauthorizedError, ValidationError } from "@/lib/errors";
import { createAdminIngestHistoryScope } from "@/lib/enterprise/admin-ingest-history-scope";
import { parseIngestAccountReactivationRequest } from "@/lib/enterprise/ingest-auth-credentials";
import { setIngestPortalCookie, toIngestAuthUser } from "@/lib/enterprise/ingest-auth-session";
import { resolveIngestAccessTier } from "@/lib/enterprise/ingest-access-tier";
import { prisma } from "@/lib/prisma";
import { checkPersistentRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { hasDatabaseUrl, hasSessionSecret } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REACTIVATION_FAILED_MESSAGE = "原账号或新小董AI卡密验证失败，请检查后重试。";
const LICENSE_ALREADY_USED_MESSAGE = "该卡密已经被使用。";
const LICENSE_ALREADY_ACTIVATED_MESSAGE = "该卡密已经激活，请直接登录。";

function reactivationUnauthorized() {
  return new UnauthorizedError(REACTIVATION_FAILED_MESSAGE);
}

function licenseAlreadyUsed(message = LICENSE_ALREADY_USED_MESSAGE) {
  return new AppError("LICENSE_USED", message, 409);
}

export async function POST(request: Request) {
  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("恢复小董AI原账号"));
  }

  if (!hasSessionSecret()) {
    return apiError(sessionConfigError("恢复小董AI原账号"));
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError(new ValidationError("请求体必须是合法 JSON。"));
  }

  let input: ReturnType<typeof parseIngestAccountReactivationRequest>;

  try {
    input = parseIngestAccountReactivationRequest(body);
  } catch (error) {
    return apiError(error);
  }

  const rateLimit = await checkPersistentRateLimit(request, {
    namespace: "ingest-auth-account-reactivation",
    limit: 5,
    windowMs: 15 * 60_000,
    globalLimit: 200
  });

  if (!rateLimit.allowed) {
    return apiError(
      new RateLimitError("账号恢复尝试过于频繁，请 " + rateLimit.retryAfterSeconds + " 秒后再试。"),
      { headers: rateLimitHeaders(rateLimit) }
    );
  }

  try {
    const normalizedLicenseKey = normalizeLicenseKey(input.licenseKey);
    const appType = getLicenseAppTypeFromKey(normalizedLicenseKey);

    if (
      !isSupportedLicenseKeyInput(normalizedLicenseKey) ||
      (appType !== "user_app" && appType !== "ingest_admin")
    ) {
      throw reactivationUnauthorized();
    }

    const user = await prisma.user.findUnique({
      where: { phone: input.phone },
      select: {
        id: true,
        isActive: true
      }
    });

    if (!user || !user.isActive) {
      throw reactivationUnauthorized();
    }

    if (!(await hasUserRedeemedLicenseHistoryForAppType(user.id, appType))) {
      throw reactivationUnauthorized();
    }

    const candidateLicenses = await prisma.licenseKey.findMany({
      where: {
        keyHash: {
          in: getAcceptedLicenseHashes(normalizedLicenseKey)
        }
      },
      select: {
        status: true,
        redeemedByUserId: true,
        expiresAt: true
      }
    });
    const now = new Date();
    const hasUnusedLicense = candidateLicenses.some((license) => (
      license.status === LicenseKeyStatus.UNUSED
      && license.redeemedByUserId === null
      && (!license.expiresAt || license.expiresAt > now)
    ));

    if (!hasUnusedLicense) {
      const usedLicense = candidateLicenses.find((license) => license.status === LicenseKeyStatus.USED);
      if (usedLicense) {
        throw licenseAlreadyUsed(
          usedLicense.redeemedByUserId === user.id
            ? LICENSE_ALREADY_ACTIVATED_MESSAGE
            : LICENSE_ALREADY_USED_MESSAGE
        );
      }

      throw reactivationUnauthorized();
    }

    const originalHistoryScope = createAdminIngestHistoryScope(user.id);
    const activatedUser = await redeemLicenseKey(user.id, normalizedLicenseKey, {
      appType,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
      userAgent: request.headers.get("user-agent") ?? undefined
    });

    if (activatedUser.id !== user.id) {
      throw new AppError("REDEEM_FAILED", "激活账号校验失败，已停止进入工作台。", 409);
    }

    const account = await prisma.user.findUnique({
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

    if (!account || !account.isActive) {
      throw reactivationUnauthorized();
    }

    const appUser: AppUser = {
      ...account,
      name: account.name?.trim() || account.phone
    };
    const access = await resolveIngestAccessTier(appUser);
    const nextHistoryScope = createAdminIngestHistoryScope(account.id);

    if (nextHistoryScope !== originalHistoryScope || access.accessTier === "none") {
      throw new AppError("REDEEM_FAILED", "原账号历史空间或权限复核失败，已停止进入工作台。", 409);
    }

    const session = await createSession(account.id, request);
    await setIngestPortalCookie(appUser, request, access);
    const authUser = await toIngestAuthUser(appUser, access);

    return apiSuccess({
      success: true,
      authenticated: true,
      reactivated: true,
      message: "原账号已恢复，历史记录与知识资料保持不变。",
      sessionToken: session.token,
      userId: account.id,
      historyScope: nextHistoryScope,
      permission: access.accessTier,
      appType,
      licenseActivated: authUser.licenseActivated,
      hasIngestPortalAccess: authUser.hasIngestPortalAccess,
      hasIngestAccess: authUser.hasIngestAccess,
      accessTier: authUser.accessTier,
      capabilities: authUser.capabilities,
      redirectTarget: appType === "user_app"
        ? "/app"
        : "/admin-ingest?app=ingest-admin&platform=web",
      user: authUser
    });
  } catch (error) {
    if (error instanceof AppError && error.code === "LICENSE_ACTIVATION_LIMIT_REACHED") {
      return apiError(licenseAlreadyUsed());
    }

    return apiError(error);
  }
}
