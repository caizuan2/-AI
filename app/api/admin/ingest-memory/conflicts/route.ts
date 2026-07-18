import { NextResponse } from "next/server";
import { requireAdminIngestActor } from "@/lib/enterprise/admin-ingest-auth";
import { detectMemoryConflicts } from "@/lib/enterprise/ingest-memory-conflict-detector";
import { listMemoryDrafts } from "@/lib/enterprise/ingest-memory-store";
import { AppError, ValidationError } from "@/lib/errors";
import type { IngestMemoryItem } from "@/lib/enterprise/ingest-memory-types";

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

function readMemory(value: unknown): IngestMemoryItem {
  if (!value || typeof value !== "object") {
    throw new ValidationError("newMemory 不能为空。");
  }

  const memory = value as Partial<IngestMemoryItem>;

  if (!memory.id || !memory.title || !memory.content || !memory.type) {
    throw new ValidationError("newMemory 缺少必要字段。");
  }

  return memory as IngestMemoryItem;
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdminIngestActor(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "admin_ingest_memory_conflicts"
    });

    const body = await request.json() as Record<string, unknown>;
    const newMemory = readMemory(body.newMemory);
    const existingMemories = Array.isArray(body.existingMemories)
      ? body.existingMemories.filter((item): item is IngestMemoryItem => Boolean(item && typeof item === "object"))
      : await listMemoryDrafts({
        agentId: typeof body.agentId === "string" ? body.agentId : newMemory.agentId,
        knowledgeBaseId: typeof body.knowledgeBaseId === "string" ? body.knowledgeBaseId : newMemory.knowledgeBaseId,
        ownerAdminId: actor.id,
        ownerUserId: actor.id
      });
    const result = detectMemoryConflicts({
      newMemory,
      existingMemories
    });

    return NextResponse.json({
      success: true,
      ok: true,
      ...result
    });
  } catch (error) {
    return jsonError(error);
  }
}
