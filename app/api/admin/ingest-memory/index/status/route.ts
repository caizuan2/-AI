import { NextRequest, NextResponse } from "next/server";

import { loadMemoryIndex } from "@/lib/enterprise/ingest-memory-index-builder";
import { listPublishedMemories } from "@/lib/enterprise/ingest-memory-publisher";
import { listMemoryDrafts } from "@/lib/enterprise/ingest-memory-store";
import { diagnoseMemoryDrafts } from "@/lib/enterprise/ingest-memory-publish-diagnostics";
import { requireAdminIngestActor } from "@/lib/enterprise/admin-ingest-auth";
import { publicExpertScopeValuesOverlap } from "@/lib/enterprise/public-expert-scope";
import { AppError } from "@/lib/errors";
import type { MemoryIndexEntry, PublishedMemoryItem } from "@/lib/enterprise/ingest-memory-index-types";

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

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeScopeValue(value: unknown): string {
  return readString(value).toLowerCase();
}

function scopeValueMatches(requested: string, values: unknown[]): boolean {
  const normalizedRequested = normalizeScopeValue(requested);

  if (!normalizedRequested) {
    return true;
  }

  return values.some((value) => {
    const normalizedValue = normalizeScopeValue(value);

    return Boolean(
      normalizedValue &&
      (normalizedValue === normalizedRequested || publicExpertScopeValuesOverlap(normalizedRequested, normalizedValue))
    );
  });
}

function scopedRecordMatches(input: {
  agentId: string;
  knowledgeBaseId: string;
}, candidate: {
  agentValues: unknown[];
  knowledgeBaseValues: unknown[];
}) {
  const hasAgentScope = Boolean(input.agentId);
  const hasKnowledgeBaseScope = Boolean(input.knowledgeBaseId);
  const agentMatches = scopeValueMatches(input.agentId, candidate.agentValues);
  const knowledgeBaseMatches = scopeValueMatches(input.knowledgeBaseId, candidate.knowledgeBaseValues);

  if (hasAgentScope && hasKnowledgeBaseScope) {
    return agentMatches || knowledgeBaseMatches;
  }

  return agentMatches && knowledgeBaseMatches;
}

function publishedMemoryMatchesScope(memory: PublishedMemoryItem, input: {
  agentId: string;
  knowledgeBaseId: string;
}) {
  return scopedRecordMatches(input, {
    agentValues: [memory.agentId, memory.expertId, memory.meta?.agentId, memory.meta?.expertId],
    knowledgeBaseValues: [memory.knowledgeBaseId, memory.kbId, memory.namespace, memory.meta?.knowledgeBaseId, memory.meta?.kbId, memory.meta?.namespace]
  });
}

function indexEntryMatchesScope(entry: MemoryIndexEntry, input: {
  agentId: string;
  knowledgeBaseId: string;
}) {
  return scopedRecordMatches(input, {
    agentValues: [entry.agentId, entry.expertId],
    knowledgeBaseValues: [entry.knowledgeBaseId, entry.kbId, entry.namespace]
  });
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminIngestActor(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "ingest-memory-index",
    });

    const url = new URL(request.url);
    const agentId = readString(url.searchParams.get("agentId"));
    const knowledgeBaseId = readString(url.searchParams.get("knowledgeBaseId"));
    const scopeInput = { agentId, knowledgeBaseId };
    const [index, memories, drafts] = await Promise.all([
      loadMemoryIndex(),
      listPublishedMemories(),
      listMemoryDrafts({
        ...(agentId ? { agentId } : {}),
        ...(knowledgeBaseId ? { knowledgeBaseId } : {})
      })
    ]);
    const scopedMemories = memories.filter((memory) => publishedMemoryMatchesScope(memory, scopeInput));
    const scopedEntries = index.entries.filter((entry) => indexEntryMatchesScope(entry, scopeInput));
    const diagnostics = diagnoseMemoryDrafts(drafts);

    return NextResponse.json({
      ok: true,
      draftCount: diagnostics.draftCount,
      publishableCount: diagnostics.publishableCount,
      publishedCount: scopedMemories.length,
      totalPublished: scopedMemories.length,
      indexedCount: scopedEntries.length,
      totalIndexed: scopedEntries.length,
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
