import { NextRequest, NextResponse } from "next/server";

import { loadMemoryIndex } from "@/lib/enterprise/ingest-memory-index-builder";
import { listPublishedMemories } from "@/lib/enterprise/ingest-memory-publisher";
import { listMemoryDrafts } from "@/lib/enterprise/ingest-memory-store";
import { diagnoseMemoryDrafts } from "@/lib/enterprise/ingest-memory-publish-diagnostics";
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

export async function GET(request: NextRequest) {
  try {
    await requireAdminIngestActor(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "ingest-memory-index",
    });

    const [index, memories, drafts] = await Promise.all([loadMemoryIndex(), listPublishedMemories(), listMemoryDrafts()]);
    const diagnostics = diagnoseMemoryDrafts(drafts);

    return NextResponse.json({
      ok: true,
      draftCount: diagnostics.draftCount,
      publishableCount: diagnostics.publishableCount,
      publishedCount: memories.length,
      totalPublished: memories.length,
      indexedCount: index.entries.length,
      totalIndexed: index.entries.length,
      builtAt: index.builtAt,
      lastBuiltAt: index.builtAt,
      source: index.source,
      warnings: index.warnings ?? [],
      skippedReasons: diagnostics.skippedReasons,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return jsonError(error);
    }

    console.error("[admin.ingest-memory.index.status] failed", error);
    return jsonError(new AppError("UNKNOWN_ERROR", "读取训练记忆索引状态失败", 500));
  }
}
