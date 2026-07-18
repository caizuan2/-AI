import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { searchRuntimeMemories } from "@/lib/enterprise/ingest-memory-runtime-search";
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
    await requireUser();

    const body = await request.json().catch(() => ({}));
    const result = await searchRuntimeMemories({
      query: String(body?.query || ""),
      knowledgeBaseId: body?.knowledgeBaseId,
      kbId: body?.kbId,
      agentId: body?.agentId,
      expertId: body?.expertId,
      namespace: body?.namespace,
      tenantId: body?.tenantId,
      limit: Number.isFinite(Number(body?.limit)) ? Number(body.limit) : undefined,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return jsonError(error);
    }

    console.error("[runtime.memory.search] failed", error);
    return jsonError(new AppError("UNKNOWN_ERROR", "检索训练记忆失败", 500));
  }
}
