import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { requireAdminIngestActor } from "@/lib/enterprise/admin-ingest-auth";
import { buildReleaseWorkflowStates } from "@/lib/enterprise/release-console-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdminIngestActor(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "admin_ingest_release_workflows"
    });
    const state = await buildReleaseWorkflowStates();

    return NextResponse.json({
      ok: true,
      github: state.github,
      workflows: state.workflows,
      diagnostics: state.diagnostics
    }, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return apiError(error);
  }
}
