import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { getRuntimeMemoryStatus } from "@/lib/enterprise/ingest-memory-runtime-search";
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

export async function GET() {
  try {
    await requireUser();

    const status = await getRuntimeMemoryStatus();
    return NextResponse.json(status);
  } catch (error) {
    if (error instanceof AppError) {
      return jsonError(error);
    }

    console.error("[runtime.memory.status] failed", error);
    return jsonError(new AppError("UNKNOWN_ERROR", "读取训练记忆运行时状态失败", 500));
  }
}
