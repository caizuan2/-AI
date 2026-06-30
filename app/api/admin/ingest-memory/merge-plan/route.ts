import { NextResponse } from "next/server";
import { requireAdminIngestActor } from "@/lib/enterprise/admin-ingest-auth";
import { createMemoryMergePlan } from "@/lib/enterprise/ingest-memory-draft-merger";
import { listMemoryDrafts } from "@/lib/enterprise/ingest-memory-store";
import { AppError, ValidationError } from "@/lib/errors";

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
    await requireAdminIngestActor(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "admin_ingest_memory_merge_plan"
    });
    const body = await request.json() as Record<string, unknown>;
    const sourceIds = Array.isArray(body.sourceIds)
      ? body.sourceIds.filter((id): id is string => typeof id === "string")
      : [];

    if (sourceIds.length === 0) {
      throw new ValidationError("sourceIds 不能为空。");
    }

    const drafts = await listMemoryDrafts({
      agentId: typeof body.agentId === "string" ? body.agentId : undefined,
      knowledgeBaseId: typeof body.knowledgeBaseId === "string" ? body.knowledgeBaseId : undefined
    });
    const items = drafts.filter((draft) => sourceIds.includes(draft.id));
    const plan = createMemoryMergePlan({ items });

    return NextResponse.json({
      success: true,
      ...plan
    });
  } catch (error) {
    return jsonError(error);
  }
}
