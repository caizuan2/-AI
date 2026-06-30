import { NextResponse } from "next/server";
import { requireAdminIngestActor } from "@/lib/enterprise/admin-ingest-auth";
import { retrieveRelevantMemories } from "@/lib/enterprise/ingest-memory-retriever";
import { AppError } from "@/lib/errors";
import type { IngestMemoryConversationMessage } from "@/lib/enterprise/ingest-memory-types";

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

function readMessages(value: unknown): IngestMemoryConversationMessage[] {
  return Array.isArray(value)
    ? value.filter((item): item is IngestMemoryConversationMessage => Boolean(item && typeof item === "object"))
    : [];
}

export async function POST(request: Request) {
  try {
    await requireAdminIngestActor(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "admin_ingest_memory_retrieve"
    });

    const body = await request.json() as Record<string, unknown>;
    const result = await retrieveRelevantMemories({
      query: typeof body.query === "string" ? body.query : "",
      conversationId: typeof body.conversationId === "string" ? body.conversationId : undefined,
      agentId: typeof body.agentId === "string" ? body.agentId : undefined,
      knowledgeBaseId: typeof body.knowledgeBaseId === "string" ? body.knowledgeBaseId : undefined,
      messages: readMessages(body.messages),
      limit: typeof body.limit === "number" ? body.limit : undefined,
      minScore: typeof body.minScore === "number" ? body.minScore : undefined
    });

    return NextResponse.json({
      success: true,
      ...result
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET(request: Request) {
  try {
    await requireAdminIngestActor(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "admin_ingest_memory_retrieve"
    });

    const url = new URL(request.url);
    const result = await retrieveRelevantMemories({
      query: url.searchParams.get("query") ?? "",
      conversationId: url.searchParams.get("conversationId") || undefined,
      agentId: url.searchParams.get("agentId") || undefined,
      knowledgeBaseId: url.searchParams.get("knowledgeBaseId") || undefined,
      limit: Number(url.searchParams.get("limit") || 5),
      minScore: Number(url.searchParams.get("minScore") || 0.25)
    });

    return NextResponse.json({
      success: true,
      ...result
    });
  } catch (error) {
    return jsonError(error);
  }
}
