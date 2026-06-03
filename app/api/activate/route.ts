import { apiError, apiSuccess } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { requireUser } from "@/lib/auth";
import { redeemLicenseKey } from "@/lib/auth/license";
import { ValidationError } from "@/lib/errors";

export const dynamic = "force-dynamic";

interface ActivateResponse {
  ok: true;
  message: "激活成功。";
  licenseActivated: true;
}

function parseActivateRequest(body: unknown) {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";

  if (!code) {
    throw new ValidationError("请输入卡密。");
  }

  return { code, userId };
}

function getRequestIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => null);
    const input = parseActivateRequest(body);

    if (input.userId && input.userId !== user.id && input.userId !== user.phone) {
      throw new ValidationError("用户身份与当前登录账号不一致。");
    }

    await redeemLicenseKey(user.id, input.code, {
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
