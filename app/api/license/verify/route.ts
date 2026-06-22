import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { requireUser } from "@/lib/auth";
import { ValidationError } from "@/lib/errors";
import { hasDatabaseUrl } from "@/lib/server-config";
import {
  getSaasLicenseStatus,
  type LicenseFeature
} from "@/lib/core/license-gate";
import { resolveTenantContext } from "@/lib/core/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const licenseFeatures: LicenseFeature[] = ["ai", "ingest", "chat", "embedding"];

function readFeature(value: unknown) {
  return typeof value === "string" && licenseFeatures.includes(value as LicenseFeature)
    ? value as LicenseFeature
    : null;
}

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function verify(request: Request, feature: LicenseFeature | null) {
  let actor: Awaited<ReturnType<typeof requireUser>>;

  try {
    actor = await requireUser();
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("校验 SaaS 卡密状态"));
  }

  try {
    const tenant = await resolveTenantContext({
      id: actor.id,
      role: "user"
    }, request);
    const license = await getSaasLicenseStatus({ id: actor.id }, tenant);

    return apiSuccess({
      tenant,
      license,
      feature,
      allowed: feature ? license.features[feature] : license.active
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  return verify(request, readFeature(url.searchParams.get("feature")));
}

export async function POST(request: Request) {
  const body = await readJsonBody(request);

  if (!isPlainObject(body)) {
    return apiError(new ValidationError("请求体必须是 JSON 对象。"));
  }

  return verify(request, readFeature(body.feature));
}
