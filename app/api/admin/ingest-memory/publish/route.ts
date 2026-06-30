import { NextRequest, NextResponse } from "next/server";

import { publishMemoryDrafts } from "@/lib/enterprise/ingest-memory-publisher";
import { requireAdminIngestActor } from "@/lib/enterprise/admin-ingest-auth";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

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

export async function POST(request: NextRequest) {
  try {
    await requireAdminIngestActor(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "ingest-memory",
    });

    const body = await request.json().catch(() => ({}));
    const result = await publishMemoryDrafts({
      draftIds: Array.isArray(body?.draftIds) ? body.draftIds : undefined,
      publishAllSaved: body?.publishAllSaved !== false,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return jsonError(error);
    }

    console.error("[admin.ingest-memory.publish] failed", error);
    return jsonError(new AppError("UNKNOWN_ERROR", "发布训练记忆失败", 500));
  }
}
