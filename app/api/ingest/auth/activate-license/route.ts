import { NextResponse } from "next/server";
import { apiSuccess } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { requireUser } from "@/lib/auth";
import {
  getLicenseAppTypeFromKey,
  hasUserRedeemedLicenseHistory,
  isSupportedLicenseKeyInput,
  normalizeLicenseKey,
  redeemLicenseKey
} from "@/lib/auth/license";
import { AppError, toAppError, ValidationError } from "@/lib/errors";
import { createAdminIngestHistoryScope } from "@/lib/enterprise/admin-ingest-history-scope";
import { resolveIngestAccessTier } from "@/lib/enterprise/ingest-access-tier";
import { setIngestPortalCookie, toIngestAuthUser } from "@/lib/enterprise/ingest-auth-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readActivationRequest(body: unknown) {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const licenseKey = readString(body.licenseKey) || readString(body.code) || readString(body.key);

  if (!licenseKey) {
    throw new ValidationError("请输入卡密。");
  }

  const normalizedLicenseKey = normalizeLicenseKey(licenseKey);

  if (!isSupportedLicenseKeyInput(normalizedLicenseKey)) {
    throw new ValidationError("卡密格式无效。");
  }

  const appType = getLicenseAppTypeFromKey(normalizedLicenseKey);

  if (appType !== "user_app" && appType !== "ingest_admin") {
    throw new ValidationError("请使用用户端或投喂端卡密。");
  }

  return { licenseKey: normalizedLicenseKey, appType };
}

type IngestActivationErrorCode =
  | "LICENSE_NOT_FOUND"
  | "LICENSE_USED"
  | "LICENSE_DISABLED"
  | "LICENSE_EXPIRED"
  | "LICENSE_APP_MISMATCH"
  | "USER_NOT_AUTHENTICATED"
  | "ACCOUNT_DISABLED"
  | "DATABASE_ROLE_ENUM_UNSUPPORTED"
  | "DATABASE_ERROR"
  | "REDEEM_FAILED";

function isDatabaseRoleEnumUnsupported(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const value = error as { code?: unknown; message?: unknown };
  const message = typeof value.message === "string" ? value.message : "";

  return /UserRole|invalid input value for enum|not found in enum/i.test(message);
}

function toActivationError(error: unknown): {
  code: IngestActivationErrorCode;
  message: string;
  status: number;
} {
  if (isDatabaseRoleEnumUnsupported(error)) {
    return {
      code: "DATABASE_ROLE_ENUM_UNSUPPORTED",
      message: "当前数据库角色枚举暂不支持投喂端角色，已按兼容角色处理。请重试。",
      status: 500
    };
  }

  const appError = error instanceof AppError ? error : toAppError(error);

  if (appError.code === "UNAUTHORIZED") {
    return { code: "USER_NOT_AUTHENTICATED", message: "当前账号未登录，请先登录。", status: 401 };
  }

  if (appError.code === "FORBIDDEN") {
    return {
      code: "ACCOUNT_DISABLED",
      message: appError.message || "账号已禁用，不能通过更换卡密恢复。",
      status: 403
    };
  }

  if (appError.code === "LICENSE_NOT_FOUND" || appError.code === "INVALID_LICENSE_KEY") {
    return { code: "LICENSE_NOT_FOUND", message: appError.message || "卡密不存在或无效。", status: appError.statusCode };
  }

  if (appError.code === "LICENSE_ACTIVATION_LIMIT_REACHED") {
    return { code: "LICENSE_USED", message: "卡密已使用。", status: appError.statusCode };
  }

  if (appError.code === "LICENSE_DISABLED") {
    return { code: "LICENSE_DISABLED", message: "卡密已禁用。", status: appError.statusCode };
  }

  if (appError.code === "LICENSE_EXPIRED") {
    return { code: "LICENSE_EXPIRED", message: "卡密已过期。", status: appError.statusCode };
  }

  if (appError.code === "LICENSE_APP_TYPE_MISMATCH") {
    return { code: "LICENSE_APP_MISMATCH", message: "卡密不属于投喂版。", status: appError.statusCode };
  }

  if (appError.code === "DATABASE_ROLE_ENUM_UNSUPPORTED") {
    return { code: "DATABASE_ROLE_ENUM_UNSUPPORTED", message: appError.message, status: appError.statusCode };
  }

  if (
    appError.code === "DATABASE_ERROR" ||
    appError.code === "DATABASE_CONNECTION_FAILED" ||
    appError.code === "DATABASE_SCHEMA_MISSING"
  ) {
    return { code: "DATABASE_ERROR", message: appError.message || "数据库暂不可用。", status: appError.statusCode };
  }

  return {
    code: "REDEEM_FAILED",
    message: appError.message || "卡密激活失败，请稍后重试。",
    status: appError.statusCode >= 400 ? appError.statusCode : 500
  };
}

function activationErrorResponse(error: unknown) {
  const mapped = toActivationError(error);

  return NextResponse.json(
    {
      ok: false,
      success: false,
      code: mapped.code,
      message: mapped.message,
      error: {
        code: mapped.code,
        message: mapped.message
      }
    },
    { status: mapped.status }
  );
}

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof requireUser>>;

  try {
    user = await requireUser();
  } catch (error) {
    return activationErrorResponse(error);
  }

  let input: ReturnType<typeof readActivationRequest>;

  try {
    input = readActivationRequest(await request.json());
  } catch (error) {
    return activationErrorResponse(error instanceof Error ? error : new ValidationError("请求体必须是合法 JSON。"));
  }

  try {
    const originalUserId = user.id;
    const originalHistoryScope = createAdminIngestHistoryScope(originalUserId);
    const reactivation = user.licenseActivated
      || await hasUserRedeemedLicenseHistory(originalUserId);
    const activatedUser = await redeemLicenseKey(user.id, input.licenseKey, {
      appType: input.appType,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
      userAgent: request.headers.get("user-agent") ?? undefined
    });

    if (activatedUser.id !== originalUserId) {
      throw new AppError("REDEEM_FAILED", "激活账号校验失败，请重新登录原账号后再试。", 409);
    }

    const nextUser = {
      ...user,
      licenseActivated: activatedUser.licenseActivated
    };
    const access = await resolveIngestAccessTier(nextUser);
    const nextHistoryScope = createAdminIngestHistoryScope(activatedUser.id);

    if (nextHistoryScope !== originalHistoryScope) {
      throw new AppError("REDEEM_FAILED", "历史空间校验失败，已停止进入工作台。", 409);
    }

    if (access.accessTier === "none") {
      throw new AppError("REDEEM_FAILED", "新卡已绑定，但权限复核失败，请联系管理员。", 409);
    }

    await setIngestPortalCookie(nextUser, request, access);

    const authUser = await toIngestAuthUser(nextUser, access);
    const message = reactivation
      ? access.accessTier === "full_ingest"
        ? "原账号已恢复，历史记录与知识资料保持不变。"
        : "原账号已恢复为聊天版，历史记录与知识资料保持不变；完整投喂功能需使用 XT-INGEST 卡密。"
      : access.accessTier === "full_ingest"
        ? "投喂版权限激活成功。"
        : "聊天版权限激活成功；完整投喂功能需使用 XT-INGEST 卡密。";

    return apiSuccess({
      success: true,
      message,
      reactivated: reactivation,
      userId: activatedUser.id,
      historyScope: nextHistoryScope,
      permission: access.accessTier,
      appType: input.appType,
      licenseActivated: authUser.licenseActivated,
      hasIngestPortalAccess: authUser.hasIngestPortalAccess,
      hasIngestAccess: authUser.hasIngestAccess,
      accessTier: authUser.accessTier,
      capabilities: authUser.capabilities,
      user: authUser
    });
  } catch (error) {
    return activationErrorResponse(error);
  }
}
