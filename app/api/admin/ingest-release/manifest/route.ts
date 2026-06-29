import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { requireAdminIngestActor } from "@/lib/enterprise/admin-ingest-auth";
import { buildReleaseManifestResponse } from "@/lib/enterprise/release-console-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdminIngestActor(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "admin_ingest_release_manifest"
    });

    return NextResponse.json(buildReleaseManifestResponse(), {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return apiError(error);
  }
}
