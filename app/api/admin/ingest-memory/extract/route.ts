import { NextResponse } from "next/server";
import { requireAdminIngestActor } from "@/lib/enterprise/admin-ingest-auth";
import { extractMemoriesFromConversation } from "@/lib/enterprise/ingest-memory-extractor";
import {
  canonicalizeCareerMemoryExtractionInput,
  canonicalizeCareerMemoryExtractionResult
} from "@/lib/enterprise/ingest-memory-career-scope";
import { persistMemoryExtraction } from "@/lib/enterprise/ingest-memory-panel-service";
import { AppError, ValidationError } from "@/lib/errors";
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

function readBody(input: unknown) {
  if (!input || typeof input !== "object") {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const body = input as Record<string, unknown>;
  const conversationId = typeof body.conversationId === "string" && body.conversationId.trim()
    ? body.conversationId.trim()
    : "";
  const messages = Array.isArray(body.messages)
    ? body.messages.filter((item): item is IngestMemoryConversationMessage => Boolean(item && typeof item === "object"))
    : [];

  if (!conversationId) {
    throw new ValidationError("conversationId 不能为空。");
  }

  return {
    conversationId,
    agentId: typeof body.agentId === "string" ? body.agentId : undefined,
    knowledgeBaseId: typeof body.knowledgeBaseId === "string" ? body.knowledgeBaseId : undefined,
    messages,
    latestAssistantReply: typeof body.latestAssistantReply === "string" ? body.latestAssistantReply : undefined,
    userInstruction: typeof body.userInstruction === "string" ? body.userInstruction : undefined,
    saveIntent: Boolean(body.saveIntent)
  };
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdminIngestActor(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "admin_ingest_memory_extract"
    });

    const rawSource = {
      ...readBody(await request.json()),
      ownerAdminId: actor.id,
      ownerUserId: actor.id
    };
    const source = canonicalizeCareerMemoryExtractionInput(rawSource);
    const extraction = canonicalizeCareerMemoryExtractionResult(
      extractMemoriesFromConversation(rawSource)
    );
    const persisted = await persistMemoryExtraction({
      extraction,
      source
    });

    return NextResponse.json({
      success: true,
      ...extraction,
      persistedDraftCount: persisted.savedDrafts.length,
      agentLearning: persisted.learningState
    });
  } catch (error) {
    return jsonError(error);
  }
}
