import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { requireKbAdmin } from "@/lib/auth/guards";
import { retryAdminKbIngestionJob } from "@/lib/admin-kb/ingestion";
import { hasDatabaseUrl } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function POST(request: Request, context: RouteContext) {
  let actor: Awaited<ReturnType<typeof requireKbAdmin>>;

  try {
    actor = await requireKbAdmin(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "admin_kb_job",
      targetId: context.params.id
    });
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("重试投喂任务"));
  }

  try {
    const result = await retryAdminKbIngestionJob(actor, context.params.id);

    return apiSuccess(result);
  } catch (error) {
    return apiError(error);
  }
}
