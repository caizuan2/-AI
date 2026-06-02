import { apiError, apiSuccess } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { requireUser } from "@/lib/auth";
import { redeemLicenseKey } from "@/lib/auth/license";
import { ValidationError } from "@/lib/errors";

export const dynamic = "force-dynamic";

interface RedeemLicenseResponse {
  success: true;
  licenseActivated: true;
}

function parseRedeemRequest(body: unknown) {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const licenseKey = typeof body.licenseKey === "string" ? body.licenseKey.trim() : "";

  if (!licenseKey) {
    throw new ValidationError("请输入卡密。");
  }

  return { licenseKey };
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => null);
    const input = parseRedeemRequest(body);

    await redeemLicenseKey(user.id, input.licenseKey);

    return apiSuccess<RedeemLicenseResponse>({
      success: true,
      licenseActivated: true
    });
  } catch (error) {
    return apiError(error);
  }
}
