import { apiError, apiSuccess, databaseConfigError, sessionConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { createSession } from "@/lib/auth";
import {
  getEntryPathFromAccessProfile,
  getEntryRoleFromAccessProfile,
  getUserAccessProfile,
  hasUserClientAccess
} from "@/lib/auth/access-control";
import { normalizePhone, validatePhone } from "@/lib/auth/phone";
import { enterUserApp, type UserEntryMode } from "@/lib/auth/user-entry";
import type { EntryRole } from "@/lib/auth/product";
import { ForbiddenError, RateLimitError, ValidationError } from "@/lib/errors";
import { checkPersistentRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { hasDatabaseUrl, hasSessionSecret } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface UserEntryResponse {
  success: true;
  entryMode: UserEntryMode;
  licenseActivated: true;
  isSuperAdmin: false;
  role: EntryRole;
  roles: string[];
  entryPath: string;
  productType: string | null;
  cardType: string | null;
  licenseType: string | null;
  appType: string | null;
  user: {
    id: string;
    phone: string;
    name: string;
  };
}

function parseUserEntryRequest(body: unknown) {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const phone = typeof body.phone === "string" ? normalizePhone(body.phone) : "";
  const password = typeof body.password === "string" ? body.password : "";
  const licenseKey = typeof body.licenseKey === "string"
    ? body.licenseKey.trim()
    : typeof body.code === "string"
      ? body.code.trim()
      : "";

  if (!validatePhone(phone)) {
    throw new ValidationError("请输入合法手机号。");
  }

  if (!password) {
    throw new ValidationError("请输入密码。");
  }

  if (password.length > 128) {
    throw new ValidationError("密码长度不能超过 128 位。");
  }

  return {
    phone,
    password,
    licenseKey
  };
}

function getRequestIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    undefined;
}

export async function POST(request: Request) {
  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("用户端登录"));
  }

  if (!hasSessionSecret()) {
    return apiError(sessionConfigError("用户端登录"));
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError(new ValidationError("请求体必须是合法 JSON。"));
  }

  let input: ReturnType<typeof parseUserEntryRequest>;

  try {
    input = parseUserEntryRequest(body);
  } catch (error) {
    return apiError(error);
  }

  const rateLimit = await checkPersistentRateLimit(request, {
    namespace: "auth-user-entry",
    userId: input.phone,
    limit: 10,
    windowMs: 15 * 60_000,
    globalLimit: 1_000
  });

  if (!rateLimit.allowed) {
    return apiError(
      new RateLimitError(`登录尝试过于频繁，请 ${rateLimit.retryAfterSeconds} 秒后再试。`),
      { headers: rateLimitHeaders(rateLimit) }
    );
  }

  try {
    const result = await enterUserApp({
      ...input,
      context: {
        appType: "user_app",
        ip: getRequestIp(request),
        userAgent: request.headers.get("user-agent") ?? undefined
      }
    });
    const accessProfile = await getUserAccessProfile(result.user);
    const role = getEntryRoleFromAccessProfile(accessProfile);

    if (role !== "user" || !hasUserClientAccess(accessProfile)) {
      throw new ForbiddenError("该账号没有用户端访问权限。");
    }

    await createSession(result.user.id, request);

    return apiSuccess<UserEntryResponse>({
      success: true,
      entryMode: result.mode,
      licenseActivated: true,
      isSuperAdmin: false,
      role,
      roles: accessProfile.roles,
      entryPath: getEntryPathFromAccessProfile(accessProfile),
      productType: accessProfile.productType,
      cardType: accessProfile.cardType,
      licenseType: accessProfile.licenseType,
      appType: accessProfile.appType,
      user: {
        id: result.user.id,
        phone: result.user.phone,
        name: result.user.name
      }
    });
  } catch (error) {
    return apiError(error);
  }
}
