import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { requireAdminIngestActor } from "@/lib/enterprise/admin-ingest-auth";
import { readReleaseAuditLog } from "@/lib/enterprise/release-audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdminIngestActor(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "admin_ingest_release_audit"
    });

    return NextResponse.json({
      ok: true,
      audit: readReleaseAuditLog(50)
    }, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return apiError(error);
  }
}
