import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { requireAdminIngestActor } from "@/lib/enterprise/admin-ingest-auth";
import { checkReleaseHealth } from "@/lib/enterprise/release-health-check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdminIngestActor(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "admin_ingest_release_health"
    });

    const origin = new URL(request.url).origin;
    const health = await checkReleaseHealth(origin, request.headers.get("cookie"));

    return NextResponse.json({
      ok: true,
      health
    }, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return apiError(error);
  }
}
