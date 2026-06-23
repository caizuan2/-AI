import { apiError, apiSuccess } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { requireUser } from "@/lib/auth";
import { getLicenseAppTypeFromKey, normalizeLicenseAppType, redeemLicenseKey } from "@/lib/auth/license";
import { ValidationError } from "@/lib/errors";

export const dynamic = "force-dynamic";

interface ActivateResponse {
  ok: true;
  message: "激活成功。";
  licenseActivated: true;
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
  if (!code) {
    throw new ValidationError("请输入卡密。");
  }

  const url = new URL(request.url);
  const appType = normalizeLicenseAppType(
    body.appType ?? body.app ?? url.searchParams.get("appType") ?? url.searchParams.get("app"),
    getLicenseAppTypeFromKey(code) ?? "user_app"
  );

  return { code, userId, appType };
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

    await redeemLicenseKey(user.id, input.code, {
      appType: input.appType,
      ip: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined
    });

    return apiSuccess<ActivateResponse>({
      ok: true,
      message: "激活成功。",
      licenseActivated: true
    });
  } catch (error) {
    return apiError(error);
  }
}
