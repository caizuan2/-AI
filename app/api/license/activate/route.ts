import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { requireUser } from "@/lib/auth";
import { ValidationError } from "@/lib/errors";
import { hasDatabaseUrl } from "@/lib/server-config";
import { activateSaasLicense } from "@/lib/core/license-gate";
import { resolveTenantContext } from "@/lib/core/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readRequest(body: unknown) {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const code = typeof body.code === "string"
    ? body.code.trim()
    : typeof body.licenseKey === "string"
      ? body.licenseKey.trim()
      : "";

  if (!code) {
    throw new ValidationError("请输入卡密。");
  }

  return { code };
}

export async function POST(request: Request) {
  let actor: Awaited<ReturnType<typeof requireUser>>;

  try {
    actor = await requireUser();
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("激活 SaaS 卡密"));
  }

  let input: ReturnType<typeof readRequest>;

  try {
    input = readRequest(await request.json());
  } catch (error) {
    return apiError(error instanceof Error ? error : new ValidationError("请求体必须是合法 JSON。"));
  }

  try {
    const tenant = await resolveTenantContext({
      id: actor.id,
      role: "user"
    }, request);
    const license = await activateSaasLicense({ id: actor.id }, tenant, input.code);

    return apiSuccess({
      tenant,
      license
    });
  } catch (error) {
    return apiError(error);
  }
}
