import { NextResponse } from "next/server";
import { requireAdminIngestActor } from "@/lib/enterprise/admin-ingest-auth";
import { buildAdminIngestPublishedMemoryContext } from "@/lib/enterprise/admin-ingest-published-memory-context";
import { AppError } from "@/lib/errors";

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

export async function POST(request: Request) {
  try {
    const actor = await requireAdminIngestActor(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "admin_ingest_memory_prompt_preview"
    });

    const body = await request.json() as Record<string, unknown>;
    const query = typeof body.query === "string" ? body.query : "";
    const agentId = typeof body.agentId === "string" ? body.agentId : "";
    const knowledgeBaseId = typeof body.knowledgeBaseId === "string" ? body.knowledgeBaseId : "";
    const actorWithTenant = actor as typeof actor & { tenantId?: unknown };
    const memoryContext = await buildAdminIngestPublishedMemoryContext({
      query,
      actorId: actor.id,
      agentId,
      knowledgeBaseId,
      namespace: typeof body.namespace === "string" ? body.namespace : null,
      tenantId: typeof actorWithTenant.tenantId === "string" ? actorWithTenant.tenantId : null,
      maxChars: typeof body.maxChars === "number" ? body.maxChars : 6_000
    });
    const finalPromptPreview = [
      memoryContext.agentLearningInstruction,
      memoryContext.memoryContextText,
      "【当前用户问题】",
      query
    ].filter(Boolean).join("\n\n");
    const debug = {
      memoryParticipated: memoryContext.usedMemoryIds.length > 0 || Boolean(memoryContext.agentLearningInstruction),
      usedMemoryIds: memoryContext.usedMemoryIds,
      recalledMemoryIds: memoryContext.retrievedMemories.map((item) => item.memory.id),
      injectedCharLength: memoryContext.memoryContextText.length,
      appliedPolicies: memoryContext.appliedPolicies,
      warnings: memoryContext.warnings
    };

    return NextResponse.json({
      success: true,
      ok: true,
      query,
      retrievedMemories: memoryContext.retrievedMemories,
      memoryContextText: memoryContext.memoryContextText,
      agentLearningInstruction: memoryContext.agentLearningInstruction,
      appliedPolicies: memoryContext.appliedPolicies,
      finalPromptPreview,
      usedMemoryIds: memoryContext.usedMemoryIds,
      debug,
      warnings: memoryContext.warnings
    });
  } catch (error) {
    return jsonError(error);
  }
}
