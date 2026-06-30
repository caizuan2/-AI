import { NextRequest, NextResponse } from "next/server";

import { rebuildMemoryIndex } from "@/lib/enterprise/ingest-memory-index-builder";
import { listPublishedMemories } from "@/lib/enterprise/ingest-memory-publisher";
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
      targetType: "ingest-memory-index",
    });

    const [index, published] = await Promise.all([
      rebuildMemoryIndex(),
      listPublishedMemories(),
    ]);

    return NextResponse.json({
      ok: true,
      success: true,
      totalPublished: published.length,
      totalIndexed: index.entries.length,
      indexedCount: index.entries.length,
      lastBuiltAt: index.builtAt,
      builtAt: index.builtAt,
      source: index.source,
      warnings: index.warnings ?? [],
    });
  } catch (error) {
    if (error instanceof AppError) {
      return jsonError(error);
    }

    console.error("[admin.ingest-memory.index.rebuild] failed", error);
    return jsonError(new AppError("UNKNOWN_ERROR", "重建训练记忆索引失败", 500));
  }
}
