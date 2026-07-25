import { apiError, apiSuccess } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { requireUser } from "@/lib/auth";
import {
  checkUserLicense,
  hasUserRedeemedLicenseHistory,
  normalizeLicenseAppType,
  redeemLicenseKey,
  type LicenseAppType
} from "@/lib/auth/license";
import { getHistoryScopeForUser } from "@/lib/auth/license-reactivation";
import { LicenseAppTypeMismatchError, ValidationError } from "@/lib/errors";

export const dynamic = "force-dynamic";

interface ActivateResponse {
  ok: true;
  message: string;
  licenseActivated: true;
  reactivated: boolean;
  userId: string;
  historyScope: string;
  permission: Exclude<LicenseAppType, "super_admin">;
}

function parseActivateRequest(body: unknown, request: Request) {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const code =
    (typeof body.code === "string" ? body.code.trim() : "") ||
    (typeof body.licenseKey === "string" ? body.licenseKey.trim() : "") ||
    (typeof body.key === "string" ? body.key.trim() : "");
  const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
  const url = new URL(request.url);
  const appType = normalizeLicenseAppType(
    body.appType ?? body.app ?? url.searchParams.get("appType") ?? url.searchParams.get("app"),
    "user_app"
  );

  if (!code) {
    throw new ValidationError("请输入卡密。");
  }

  if (appType === "super_admin") {
    throw new LicenseAppTypeMismatchError("超级管理员账号不通过普通卡密激活。");
  }

  return {
    code,
    userId,
    appType: appType as Exclude<LicenseAppType, "super_admin">
  };
}

function getRequestIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => null);
    const input = parseActivateRequest(body, request);

    if (input.userId && input.userId !== user.id && input.userId !== user.phone) {
      throw new ValidationError("用户身份与当前登录账号不一致。");
    }

    const originalUserId = user.id;
    const originalHistoryScope = getHistoryScopeForUser(originalUserId);
    const reactivated = user.licenseActivated || await hasUserRedeemedLicenseHistory(originalUserId);
    const redeemedUser = await redeemLicenseKey(originalUserId, input.code, {
      appType: input.appType,
      ip: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined
    });

    if (redeemedUser.id !== originalUserId) {
      throw new ValidationError("激活后的账号身份发生变化，请重新登录原账号后再试。");
    }

    await checkUserLicense(originalUserId, input.appType);

    return apiSuccess<ActivateResponse>({
      ok: true,
      message: reactivated ? "原账号已恢复，历史记录与知识资料保持不变。" : "激活成功。",
      licenseActivated: true,
      reactivated,
      userId: originalUserId,
      historyScope: originalHistoryScope,
      permission: input.appType
    });
  } catch (error) {
    return apiError(error);
  }
}
