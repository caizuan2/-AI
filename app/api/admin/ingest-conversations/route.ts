import { NextResponse } from "next/server";
import { requireAdminIngestChatAccess } from "@/lib/enterprise/admin-ingest-auth";
import {
  AdminIngestConversationSyncRevisionConflictError,
  clearAdminIngestConversationRequestRuntimeStatus,
  markAdminIngestConversationRequestTerminalStatus,
  markAdminIngestConversationRequestGenerating,
  markAdminIngestConversationRequestVisibleCompleted,
  mergeAdminIngestConversationSyncMessages,
  readAdminIngestConversationRuntimeStatusSnapshot,
  readAdminIngestConversationSyncSnapshot,
  writeAdminIngestConversationSyncState
} from "@/lib/enterprise/admin-ingest-conversation-sync-store";
import {
  cancelAdminIngestActiveRequest
} from "@/lib/enterprise/admin-ingest-request-cancellation-store";
import {
  mergeAdminIngestConversationRuntimeStatusMaps
} from "@/lib/enterprise/admin-ingest-conversation-runtime-status";
import {
  createAdminIngestHistoryScope,
  matchesAdminIngestHistoryScope
} from "@/lib/enterprise/admin-ingest-history-scope";
import {
  createAdminIngestFastConversationMessages,
  normalizeAdminIngestConversationSyncSnapshot
} from "@/lib/enterprise/admin-ingest-history-sync";
import { AppError } from "@/lib/errors";
import type { IngestAgentConversation } from "@/lib/enterprise/mock-agent-conversations";

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

export async function GET(request: Request) {
  try {
    const { actor, access } = await requireAdminIngestChatAccess();
    const [result, runtimeResult] = await Promise.all([
      readAdminIngestConversationSyncSnapshot(actor.id),
      readAdminIngestConversationRuntimeStatusSnapshot(actor.id)
    ]);
    const historyScope = createAdminIngestHistoryScope(actor.id);
    const state = normalizeAdminIngestConversationSyncSnapshot(result.state, {
      includeDrafts: access.accessTier === "full_ingest"
    });
    state.conversationRuntimeStatusById =
      mergeAdminIngestConversationRuntimeStatusMaps(
        state.conversationRuntimeStatusById,
        runtimeResult.statusById
      );
    const conversationId = new URL(request.url).searchParams
      .get("conversationId")
      ?.trim() ?? "";

    if (conversationId) {
      const conversation = state.agentConversations.find(
        (candidate) => candidate.id === conversationId
      );

      if (!conversation) {
        return jsonHistoryError(
          "INGEST_CONVERSATION_NOT_FOUND",
          "该对话不存在或不属于当前账号。",
          404
        );
      }

      return NextResponse.json({
        ok: true,
        success: true,
        historyScope,
        revision: result.revision,
        runtimeRevision: runtimeResult.revision,
        conversationId,
        messages: createAdminIngestFastConversationMessages(
          state.conversationMessagesById[conversationId]
        ),
        draft: access.accessTier === "full_ingest"
          ? state.conversationDraftsById[conversationId] ?? null
          : null
      }, {
        headers: {
          "Cache-Control": "no-store"
        }
      });
    }

    return NextResponse.json({
      ok: true,
      success: true,
      historyScope,
      revision: result.revision,
      runtimeRevision: runtimeResult.revision,
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
    const runtimeResult =
      await readAdminIngestConversationRuntimeStatusSnapshot(actor.id);
    const state = normalizeAdminIngestConversationSyncSnapshot(storedState, {
      includeDrafts: access.accessTier === "full_ingest"
    });
    state.conversationRuntimeStatusById =
      mergeAdminIngestConversationRuntimeStatusMaps(
        state.conversationRuntimeStatusById,
        runtimeResult.statusById
      );

    return NextResponse.json({
      ok: true,
      success: true,
      historyScope,
      revision: storedState.revision,
      runtimeRevision: runtimeResult.revision,
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

export async function PATCH(request: Request) {
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
        "历史消息保存请求无效，请稍后重试。",
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

    if (
      typeof body.conversationId !== "string"
      || !body.conversationId.trim()
    ) {
      return jsonHistoryError(
        "INGEST_HISTORY_REQUEST_INVALID",
        "历史消息保存请求无效，请稍后重试。",
        400
      );
    }

    if (
      body.operation === "mark_runtime_generating"
      || body.operation === "mark_runtime_visible_completed"
      || body.operation === "request_runtime_stop"
      || body.operation === "mark_runtime_stopped"
      || body.operation === "mark_runtime_failed"
      || body.operation === "mark_runtime_timed_out"
      || body.operation === "clear_runtime_status"
    ) {
      if (typeof body.requestId !== "string" || !body.requestId.trim()) {
        return jsonHistoryError(
          "INGEST_HISTORY_REQUEST_INVALID",
          "生成状态同步请求无效，请稍后重试。",
          400
        );
      }

      const conversationId = body.conversationId.trim();
      const requestId = body.requestId.trim();
      const occurredAt = typeof body.occurredAt === "number"
        && Number.isFinite(body.occurredAt)
        && body.occurredAt >= 0
        ? body.occurredAt
        : undefined;
      let activeRequestCancelled = false;
      let stopApplied: boolean | undefined;
      const runtimeResult = body.operation === "mark_runtime_generating"
        ? await markAdminIngestConversationRequestGenerating(actor.id, {
            conversationId,
            requestId,
            startedAt: occurredAt
          })
        : body.operation === "mark_runtime_visible_completed"
          ? await markAdminIngestConversationRequestVisibleCompleted(actor.id, {
              conversationId,
              requestId,
              completedAt: occurredAt
            })
          : body.operation === "request_runtime_stop"
            ? await (async () => {
                const requested = await markAdminIngestConversationRequestTerminalStatus(actor.id, {
                  conversationId,
                  requestId,
                  state: "stop_requested",
                  occurredAt
                });
                const requestedStatus = requested.statusById[conversationId];

                if (
                  requestedStatus?.requestId !== requestId
                  || requestedStatus.state !== "stop_requested"
                ) {
                  stopApplied = false;
                  return requested;
                }

                stopApplied = true;
                activeRequestCancelled = cancelAdminIngestActiveRequest({
                  ownerUserId: actor.id,
                  conversationId,
                  requestId
                });
                return markAdminIngestConversationRequestTerminalStatus(actor.id, {
                  conversationId,
                  requestId,
                  state: "stopped",
                  occurredAt: Date.now()
                });
              })()
            : body.operation === "mark_runtime_stopped"
              || body.operation === "mark_runtime_failed"
              || body.operation === "mark_runtime_timed_out"
              ? await markAdminIngestConversationRequestTerminalStatus(actor.id, {
                  conversationId,
                  requestId,
                  state: body.operation === "mark_runtime_stopped"
                    ? "stopped"
                    : body.operation === "mark_runtime_failed"
                      ? "failed"
                      : "timed_out",
                  occurredAt
                })
              : await clearAdminIngestConversationRequestRuntimeStatus(actor.id, {
                  conversationId,
                  requestId
                });
      const storedState = await readAdminIngestConversationSyncSnapshot(actor.id);

      return NextResponse.json({
        ok: true,
        success: true,
        historyScope: createAdminIngestHistoryScope(actor.id),
        revision: storedState.revision,
        runtimeRevision: runtimeResult.revision,
        runtimeStatus: runtimeResult.statusById[conversationId] ?? null,
        stopApplied,
        activeRequestCancelled
      }, {
        headers: {
          "Cache-Control": "no-store"
        }
      });
    }

    if (
      body.operation !== "merge_conversation_messages"
      || !Array.isArray(body.messages)
    ) {
      return jsonHistoryError(
        "INGEST_HISTORY_REQUEST_INVALID",
        "历史消息保存请求无效，请稍后重试。",
        400
      );
    }

    const storedState = await mergeAdminIngestConversationSyncMessages(
      actor.id,
      {
        conversationId: body.conversationId,
        messages: body.messages,
        conversation: body.conversation
          && typeof body.conversation === "object"
          && !Array.isArray(body.conversation)
          ? body.conversation as IngestAgentConversation
          : undefined,
        includeDrafts: access.accessTier === "full_ingest"
      }
    );
    const runtimeResult =
      await readAdminIngestConversationRuntimeStatusSnapshot(actor.id);
    const state = normalizeAdminIngestConversationSyncSnapshot(storedState, {
      includeDrafts: access.accessTier === "full_ingest"
    });
    state.conversationRuntimeStatusById =
      mergeAdminIngestConversationRuntimeStatusMaps(
        state.conversationRuntimeStatusById,
        runtimeResult.statusById
      );

    return NextResponse.json({
      ok: true,
      success: true,
      historyScope: createAdminIngestHistoryScope(actor.id),
      revision: storedState.revision,
      runtimeRevision: runtimeResult.revision,
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
