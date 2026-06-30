import { NextResponse } from "next/server";
import { requireAdminIngestActor } from "@/lib/enterprise/admin-ingest-auth";
import { buildAgentLearningInstruction } from "@/lib/enterprise/ingest-agent-learning-policy";
import { buildMemoryPromptContext } from "@/lib/enterprise/ingest-memory-prompt-injector";
import { buildAgentLearningState } from "@/lib/enterprise/ingest-memory-panel-service";
import { retrieveRelevantMemories } from "@/lib/enterprise/ingest-memory-retriever";
import { buildIngestMemoryDebugSnapshot } from "@/lib/enterprise/ingest-memory-debug";
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
      targetType: "admin_ingest_memory_prompt_preview"
    });

    const body = await request.json() as Record<string, unknown>;
    const query = typeof body.query === "string" ? body.query : "";
    const agentId = typeof body.agentId === "string" ? body.agentId : undefined;
    const knowledgeBaseId = typeof body.knowledgeBaseId === "string" ? body.knowledgeBaseId : undefined;
    const messages = readMessages(body.messages);
    const retrieval = await retrieveRelevantMemories({
      query,
      conversationId: typeof body.conversationId === "string" ? body.conversationId : undefined,
      agentId,
      knowledgeBaseId,
      messages,
      limit: 5,
      minScore: typeof body.minScore === "number" ? body.minScore : 0.25
    });
    const agentLearningState = await buildAgentLearningState({ agentId, knowledgeBaseId });
    const memoryPrompt = buildMemoryPromptContext({
      query,
      retrievedMemories: retrieval.memories,
      agentLearningState,
      maxChars: typeof body.maxChars === "number" ? body.maxChars : 3000
    });
    const learningInstruction = buildAgentLearningInstruction({
      agentId,
      learningState: agentLearningState,
      userInstruction: query,
      memoryContext: memoryPrompt.memoryContextText
    });
    const finalPromptPreview = [
      learningInstruction.instructionText,
      memoryPrompt.memoryContextText,
      "【当前用户问题】",
      query
    ].filter(Boolean).join("\n\n");
    const debug = buildIngestMemoryDebugSnapshot({
      retrievedMemories: retrieval.memories,
      promptContext: memoryPrompt,
      agentLearningInstruction: learningInstruction,
      warnings: retrieval.warnings
    });

    return NextResponse.json({
      success: true,
      ok: true,
      query,
      retrievedMemories: retrieval.memories,
      memoryContextText: memoryPrompt.memoryContextText,
      agentLearningInstruction: learningInstruction.instructionText,
      appliedPolicies: learningInstruction.appliedPolicies,
      finalPromptPreview,
      usedMemoryIds: memoryPrompt.usedMemoryIds,
      debug,
      warnings: debug.warnings
    });
  } catch (error) {
    return jsonError(error);
  }
}
