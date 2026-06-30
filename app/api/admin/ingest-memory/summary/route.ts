import { NextResponse } from "next/server";
import { requireAdminIngestActor } from "@/lib/enterprise/admin-ingest-auth";
import { buildMemoryPanelSummary } from "@/lib/enterprise/ingest-memory-panel-service";
import { AppError } from "@/lib/errors";

function jsonError(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json({
      ok: false,
      success: false,
      errorCode: error.code,
      message: error.message
    }, { status: error.statusCode });
  }

  return NextResponse.json({
    ok: false,
    success: false,
    errorCode: "UNKNOWN_ERROR",
    message: error instanceof Error ? error.message : "请求处理失败。"
  }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    await requireAdminIngestActor(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "admin_ingest_memory_summary"
    });

    const url = new URL(request.url);
    const summary = await buildMemoryPanelSummary({
      agentId: url.searchParams.get("agentId") || undefined,
      knowledgeBaseId: url.searchParams.get("knowledgeBaseId") || undefined
    });

    return NextResponse.json({
      success: true,
      ...summary
    });
  } catch (error) {
    return jsonError(error);
  }
}
