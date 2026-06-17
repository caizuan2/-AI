import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { requireUser } from "@/lib/auth";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { ValidationError } from "@/lib/errors";
import { hasDatabaseUrl } from "@/lib/server-config";
import {
  createSaasLicenses,
  getSaasLicenseStatus,
  listSaasLicenses,
  type SaasLicenseStatus,
  type SaasLicenseType
} from "@/lib/core/license-gate";
import { resolveTenantContext } from "@/lib/core/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const licenseTypes: SaasLicenseType[] = ["trial", "pro", "enterprise"];

function readLicenseType(value: unknown): SaasLicenseType {
  return typeof value === "string" && licenseTypes.includes(value as SaasLicenseType)
    ? value as SaasLicenseType
    : "pro";
}

function summarizeLicenses(licenses: Array<{ status: SaasLicenseStatus; type: SaasLicenseType }>) {
  return {
    total: licenses.length,
    active: licenses.filter((item) => item.status === "active").length,
    unused: licenses.filter((item) => item.status === "unused").length,
    expired: licenses.filter((item) => item.status === "expired").length,
    disabled: licenses.filter((item) => item.status === "disabled").length,
    trial: licenses.filter((item) => item.type === "trial").length,
    pro: licenses.filter((item) => item.type === "pro").length,
    enterprise: licenses.filter((item) => item.type === "enterprise").length
  };
}

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  if (url.searchParams.get("mode") === "admin") {
    try {
      await requireSuperAdmin(request, {
        deniedAction: "RBAC_ACCESS_DENIED",
        targetType: "saas_license"
      });

      if (!hasDatabaseUrl()) {
        return apiError(databaseConfigError("读取 SaaS 卡密状态"));
      }

      const licenses = await listSaasLicenses(200);

      return apiSuccess({
        mode: "admin",
        licenses,
        summary: summarizeLicenses(licenses)
      });
    } catch (error) {
      return apiError(error);
    }
  }

  let actor: Awaited<ReturnType<typeof requireUser>>;

  try {
    actor = await requireUser();
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("读取 SaaS 卡密状态"));
  }

  try {
    const tenant = await resolveTenantContext({
      id: actor.id,
      role: "user"
    }, request);
    const license = await getSaasLicenseStatus({ id: actor.id }, tenant);

    return apiSuccess({
      mode: "current",
      tenant,
      license
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  let actor: Awaited<ReturnType<typeof requireSuperAdmin>>;

  try {
    actor = await requireSuperAdmin(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "saas_license"
    });
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("生成 SaaS 卡密"));
  }

  const body = await readJsonBody(request);

  if (!isPlainObject(body)) {
    return apiError(new ValidationError("请求体必须是 JSON 对象。"));
  }

  const count = typeof body.count === "number" ? body.count : Number(body.count ?? 1);
  const expiresAt = typeof body.expiresAt === "string" && body.expiresAt.trim()
    ? new Date(body.expiresAt)
    : null;

  if (!Number.isFinite(count) || count < 1) {
    return apiError(new ValidationError("生成数量必须大于 0。"));
  }

  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    return apiError(new ValidationError("到期时间格式不正确。"));
  }

  try {
    const codes = await createSaasLicenses({
      count,
      type: readLicenseType(body.type),
      expiresAt
    });
    const licenses = await listSaasLicenses(200);

    return apiSuccess({
      mode: "admin",
      generatedBy: actor.id,
      codes,
      licenses,
      summary: summarizeLicenses(licenses)
    }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
