import { enforceSuperAdminApiAccess, superAdminError, superAdminSuccess } from "@/app/api/super-admin/_shared";
import { canUploadDocument, checkTenantQuota } from "@/lib/quota/quota.service";
import type { QuotaAction } from "@/types/quota";

export const dynamic = "force-dynamic";

function isQuotaAction(value: unknown): value is QuotaAction {
  return value === "ai_request" ||
    value === "upload_document" ||
    value === "add_user" ||
    value === "add_knowledge" ||
    value === "unknown";
}

export async function POST(request: Request) {
  try {
    await enforceSuperAdminApiAccess(request);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const tenantId = typeof body.tenantId === "string" ? body.tenantId : "";
    const action = isQuotaAction(body.action) ? body.action : "unknown";
    const fileSizeMB = typeof body.fileSizeMB === "number" ? body.fileSizeMB : 0;

    if (!tenantId) {
      return superAdminSuccess({
        allowed: false,
        reason: "tenantId_required",
        plan: "free"
      });
    }

    return superAdminSuccess(action === "upload_document"
      ? await canUploadDocument(tenantId, fileSizeMB)
      : await checkTenantQuota(tenantId, action));
  } catch (error) {
    return superAdminError(error);
  }
}
