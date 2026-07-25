import { NextResponse } from "next/server";
import { requireAdminIngestChatAccess } from "@/lib/enterprise/admin-ingest-auth";
import {
  AdminIngestConversationSyncRevisionConflictError,
  readAdminIngestConversationSyncSnapshot,
  writeAdminIngestConversationSyncState
} from "@/lib/enterprise/admin-ingest-conversation-sync-store";
import {
  createAdminIngestHistoryScope,
  matchesAdminIngestHistoryScope
} from "@/lib/enterprise/admin-ingest-history-scope";
import {
  normalizeAdminIngestConversationSyncSnapshot
} from "@/lib/enterprise/admin-ingest-history-sync";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(error: unknown) {
  if (error instanceof AdminIngestConversationSyncRevisionConflictError) {
    return NextResponse.json({
      ok: false,
      success: false,
      errorCode: error.code,
      message: error.message,
      currentRevision: error.currentRevision
    }, {
      status: error.statusCode,
      headers: {
        "Cache-Control": "no-store"
      }
    });
  }

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
    message: "历史记录服务暂时不可用，请稍后重试。"
  }, { status: 500 });
}

function jsonHistoryError(
  errorCode: string,
  message: string,
  status: number
) {
  return NextResponse.json({
    ok: false,
    success: false,
    errorCode,
    message
  }, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

function readBaseRevision(value: unknown) {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    ? value
    : null;
}

export async function GET() {
  try {
    const { actor, access } = await requireAdminIngestChatAccess();
    const result = await readAdminIngestConversationSyncSnapshot(actor.id);
    const historyScope = createAdminIngestHistoryScope(actor.id);
    const state = normalizeAdminIngestConversationSyncSnapshot(result.state, {
      includeDrafts: access.accessTier === "full_ingest"
    });

    return NextResponse.json({
      ok: true,
      success: true,
      historyScope,
      revision: result.revision,
      state
    }, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { actor, access } = await requireAdminIngestChatAccess();
    const parsedBody = await request.json() as unknown;

    if (
      !parsedBody
      || typeof parsedBody !== "object"
      || Array.isArray(parsedBody)
    ) {
      return jsonHistoryError(
        "INGEST_HISTORY_REQUEST_INVALID",
        "历史同步请求无效，请刷新后重试。",
        400
      );
    }

    const body = parsedBody as Record<string, unknown>;

    if (!matchesAdminIngestHistoryScope(actor.id, body.historyScope)) {
      return jsonHistoryError(
        "INGEST_HISTORY_SCOPE_MISMATCH",
        "账号已切换，旧页面不能写入当前账号的历史记录。",
        409
      );
    }

    const baseRevision = readBaseRevision(body.baseRevision);

    if (
      baseRevision === null
      || !body.state
      || typeof body.state !== "object"
      || Array.isArray(body.state)
    ) {
      return jsonHistoryError(
        "INGEST_HISTORY_REQUEST_INVALID",
        "历史同步请求无效，请刷新后重试。",
        400
      );
    }

    const historyScope = createAdminIngestHistoryScope(actor.id);
    const storedState = await writeAdminIngestConversationSyncState(
      actor.id,
      body.state,
      {
        expectedRevision: baseRevision,
        includeDrafts: access.accessTier === "full_ingest"
      }
    );
    const state = normalizeAdminIngestConversationSyncSnapshot(storedState, {
      includeDrafts: access.accessTier === "full_ingest"
    });

    return NextResponse.json({
      ok: true,
      success: true,
      historyScope,
      revision: storedState.revision,
      state
    }, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return jsonError(error);
  }
}
