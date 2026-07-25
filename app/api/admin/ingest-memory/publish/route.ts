import { NextRequest, NextResponse } from "next/server";

import { publishMemoryDrafts } from "@/lib/enterprise/ingest-memory-publisher";
import { requireAdminIngestActor } from "@/lib/enterprise/admin-ingest-auth";
import { matchesAdminIngestHistoryScope } from "@/lib/enterprise/admin-ingest-history-scope";
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
    const actor = await requireAdminIngestActor(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "ingest-memory",
    });

    if (
      !matchesAdminIngestHistoryScope(
        actor.id,
        request.headers.get("x-admin-ingest-history-scope")
      )
    ) {
      return NextResponse.json({
        ok: false,
        success: false,
        code: "INGEST_HISTORY_SCOPE_MISMATCH",
        errorCode: "INGEST_HISTORY_SCOPE_MISMATCH",
        message: "账号已切换，旧页面不能继续使用当前账号。"
      }, {
        status: 409,
        headers: {
          "Cache-Control": "no-store"
        }
      });
    }

    const body = await request.json().catch(() => ({}));
    const result = await publishMemoryDrafts({
      draftIds: Array.isArray(body?.draftIds) ? body.draftIds : undefined,
      publishAllSaved: body?.publishAllSaved !== false,
      ownerAdminId: actor.id,
      ownerUserId: actor.id,
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
