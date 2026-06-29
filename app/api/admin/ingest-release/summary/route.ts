import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { requireAdminIngestActor } from "@/lib/enterprise/admin-ingest-auth";
import { buildReleaseConsoleSummary } from "@/lib/enterprise/release-console-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await requireAdminIngestActor(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "admin_ingest_release_summary"
    });
    const summary = await buildReleaseConsoleSummary({
      actor,
      requestUrl: request.url,
      cookieHeader: request.headers.get("cookie")
    });

    return NextResponse.json(summary, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return apiError(error);
  }
}
