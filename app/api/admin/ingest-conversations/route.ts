import { NextResponse } from "next/server";
import { requireAdminIngestActor } from "@/lib/enterprise/admin-ingest-auth";
import {
  readAdminIngestConversationSyncState,
  writeAdminIngestConversationSyncState
} from "@/lib/enterprise/admin-ingest-conversation-sync-store";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
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

export async function GET(request: Request) {
  try {
    const actor = await requireAdminIngestActor(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "admin_ingest_conversation_sync"
    });
    const state = await readAdminIngestConversationSyncState(actor.id);

    return NextResponse.json({
      ok: true,
      success: true,
      state
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const actor = await requireAdminIngestActor(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "admin_ingest_conversation_sync"
    });
    const body = await request.json() as Record<string, unknown>;
    const state = await writeAdminIngestConversationSyncState(actor.id, body);

    return NextResponse.json({
      ok: true,
      success: true,
      state
    });
  } catch (error) {
    return jsonError(error);
  }
}
