import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { requireAdminIngestActor } from "@/lib/enterprise/admin-ingest-auth";
import { buildReleasePermissions, buildRollbackPlan } from "@/lib/enterprise/release-console-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readTargetTag(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }

  const body = value as Record<string, unknown>;
  const targetTag = body.targetTag;

  return typeof targetTag === "string" ? targetTag.trim() : "";
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdminIngestActor(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "admin_ingest_release_rollback_plan"
    });
    const permissions = buildReleasePermissions(actor);

    if (!permissions.canCopyRollbackCommand) {
      return NextResponse.json({
        ok: false,
        error: {
          code: "ROLLBACK_PLAN_FORBIDDEN",
          message: "当前账号不能生成回滚指令。"
        }
      }, { status: 403 });
    }

    const targetTag = readTargetTag(await request.json().catch(() => null));
    const plan = buildRollbackPlan(targetTag);

    return NextResponse.json(plan, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return apiError(error);
  }
}
