import { apiError, apiSuccess } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { requireUser } from "@/lib/auth";
import { getLicenseAppTypeFromKey, normalizeLicenseAppType, redeemLicenseKey } from "@/lib/auth/license";
import { LicenseAppTypeMismatchError, ValidationError } from "@/lib/errors";

export const dynamic = "force-dynamic";

interface RedeemLicenseResponse {
  success: true;
  licenseActivated: true;
}

function parseRedeemRequest(body: unknown, request: Request) {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const licenseKey =
    (typeof body.licenseKey === "string" ? body.licenseKey.trim() : "") ||
    (typeof body.key === "string" ? body.key.trim() : "") ||
    (typeof body.code === "string" ? body.code.trim() : "");
  if (!licenseKey) {
    throw new ValidationError("请输入卡密。");
  }

  const url = new URL(request.url);
  const appType = normalizeLicenseAppType(
    body.appType ?? body.app ?? url.searchParams.get("appType") ?? url.searchParams.get("app"),
    getLicenseAppTypeFromKey(licenseKey) ?? "user_app"
  );

  if (appType !== "user_app") {
    throw new LicenseAppTypeMismatchError("用户端激活接口只能使用 XT-USER 卡密。");
  }

  return { licenseKey, appType };
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => null);
    const input = parseRedeemRequest(body, request);

    await redeemLicenseKey(user.id, input.licenseKey, {
      appType: input.appType,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
      userAgent: request.headers.get("user-agent") ?? undefined
    });

    return apiSuccess<RedeemLicenseResponse>({
      success: true,
      licenseActivated: true
    });
  } catch (error) {
    return apiError(error);
  }
}
