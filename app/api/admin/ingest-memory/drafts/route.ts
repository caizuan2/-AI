import { NextResponse } from "next/server";
import { requireAdminIngestActor } from "@/lib/enterprise/admin-ingest-auth";
import { listMemoryDrafts, updateMemoryDraftStatus } from "@/lib/enterprise/ingest-memory-store";
import { AppError, ValidationError } from "@/lib/errors";
import type { IngestMemoryStatus } from "@/lib/enterprise/ingest-memory-types";

const statuses = new Set<IngestMemoryStatus>(["draft", "suggested_merge", "confirmed", "rejected", "saved"]);

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

export async function GET(request: Request) {
  try {
    await requireAdminIngestActor(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "admin_ingest_memory_drafts"
    });

    const url = new URL(request.url);
    const drafts = await listMemoryDrafts({
      agentId: url.searchParams.get("agentId") || undefined,
      knowledgeBaseId: url.searchParams.get("knowledgeBaseId") || undefined
    });

    return NextResponse.json({
      success: true,
      ok: true,
      drafts
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdminIngestActor(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "admin_ingest_memory_draft_status"
    });
    const body = await request.json() as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : "";
    const status = typeof body.status === "string" && statuses.has(body.status as IngestMemoryStatus)
      ? body.status as IngestMemoryStatus
      : null;

    if (!id || !status) {
      throw new ValidationError("id 和 status 不能为空。");
    }

    const draft = await updateMemoryDraftStatus(id, status);

    return NextResponse.json({
      success: true,
      ok: true,
      draft
    });
  } catch (error) {
    return jsonError(error);
  }
}
