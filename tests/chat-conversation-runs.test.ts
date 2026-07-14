import assert from "node:assert/strict";
import {
  chatConversationRunReducer,
  createDraftConversationId,
  createEmptyChatConversationRunState,
  getLatestChatConversationRun,
  mergeConversationHistoryWithRun,
  updateChatConversationRunMessages,
  type ChatConversationRun
} from "../app/(user)/chat-ui/chat-ui-state";
import type { ChatMessageView } from "../app/(user)/chat-ui/types";

const startedAt = Date.parse("2026-07-15T00:00:00.000Z");

function message(input: {
  id: string;
  role: ChatMessageView["role"];
  content: string;
  pending?: boolean;
}): ChatMessageView {
  return {
    ...input,
    created_at: new Date(startedAt).toISOString()
  };
}

function run(input: {
  requestId: string;
  viewId: string;
  title: string;
  content: string;
}): ChatConversationRun {
  return {
    requestId: input.requestId,
    viewId: input.viewId,
    serverConversationId: null,
    phase: "uploading",
    mode: "fast",
    messages: [
      message({
        id: `${input.requestId}-user`,
        role: "user",
        content: input.content,
        pending: true
      }),
      message({
        id: `${input.requestId}-assistant`,
        role: "assistant",
        content: "",
        pending: true
      })
    ],
    localUserMessageId: `${input.requestId}-user`,
    localAssistantMessageId: `${input.requestId}-assistant`,
    finalMessageId: null,
    title: input.title,
    error: null,
    startedAt,
    updatedAt: startedAt
  };
}

function main() {
  const requestA = "request-a";
  const draftA = createDraftConversationId(requestA);
  const requestB = "request-b";
  const conversationB = "conversation-b";
  let state = createEmptyChatConversationRunState();

  state = chatConversationRunReducer(state, {
    type: "run/start",
    run: run({
      requestId: requestA,
      viewId: draftA,
      title: "A conversation",
      content: "A prompt"
    })
  });

  assert.equal(getLatestChatConversationRun(state, draftA)?.phase, "uploading");
  assert.equal(getLatestChatConversationRun(state, conversationB), null);

  state = chatConversationRunReducer(state, {
    type: "run/mark-generating",
    requestId: requestA,
    mode: "expert",
    updatedAt: startedAt + 1
  });
  state = updateChatConversationRunMessages(
    state,
    requestA,
    (messages) => messages.map((item) => (
      item.id === `${requestA}-assistant`
        ? { ...item, content: "A token" }
        : item
    )),
    startedAt + 2
  );

  const generatingA = getLatestChatConversationRun(state, draftA);

  assert.equal(generatingA?.phase, "generating");
  assert.equal(generatingA?.mode, "expert");
  assert.equal(generatingA?.messages[1]?.content, "A token");

  state = chatConversationRunReducer(state, {
    type: "run/start",
    run: run({
      requestId: requestB,
      viewId: conversationB,
      title: "B conversation",
      content: "B prompt"
    })
  });
  state = chatConversationRunReducer(state, {
    type: "run/mark-generating",
    requestId: requestB,
    mode: "fast",
    updatedAt: startedAt + 3
  });

  assert.equal(getLatestChatConversationRun(state, draftA)?.messages[1]?.content, "A token");
  assert.equal(getLatestChatConversationRun(state, conversationB)?.requestId, requestB);
  assert.notEqual(
    getLatestChatConversationRun(state, draftA),
    getLatestChatConversationRun(state, conversationB)
  );

  const pendingHistory = [
    message({ id: "b-history-user", role: "user", content: "Earlier B prompt" })
  ];
  const pendingHistoryMerge = mergeConversationHistoryWithRun({
    historyMessages: pendingHistory,
    run: getLatestChatConversationRun(state, conversationB)
  });

  assert.equal(pendingHistoryMerge.source, "runtime");
  assert.equal(pendingHistoryMerge.messages[0]?.content, "B prompt");
  assert.equal(pendingHistoryMerge.dropRequestId, null);

  const finalMessageA = "assistant-a-final";
  const completedMessagesA = [
    message({ id: `${requestA}-user`, role: "user", content: "A prompt" }),
    message({ id: finalMessageA, role: "assistant", content: "A final answer" })
  ];

  state = chatConversationRunReducer(state, {
    type: "run/complete",
    requestId: requestA,
    conversationId: "conversation-a",
    mode: "expert",
    finalMessageId: finalMessageA,
    messages: completedMessagesA,
    updatedAt: startedAt + 4
  });

  assert.equal(getLatestChatConversationRun(state, draftA), null);
  assert.equal(getLatestChatConversationRun(state, "conversation-a")?.phase, "completed");
  assert.equal(
    getLatestChatConversationRun(state, "conversation-a")?.serverConversationId,
    "conversation-a"
  );
  assert.equal(getLatestChatConversationRun(state, conversationB)?.requestId, requestB);

  const completedHistoryA = [
    message({ id: `${requestA}-user`, role: "user", content: "A prompt" }),
    message({ id: finalMessageA, role: "assistant", content: "A persisted answer" })
  ];
  const completedHistoryMerge = mergeConversationHistoryWithRun({
    historyMessages: completedHistoryA,
    run: getLatestChatConversationRun(state, "conversation-a")
  });

  assert.equal(completedHistoryMerge.source, "history");
  assert.equal(completedHistoryMerge.messages[1]?.content, "A persisted answer");
  assert.equal(completedHistoryMerge.dropRequestId, requestA);

  state = chatConversationRunReducer(state, {
    type: "run/drop",
    requestId: completedHistoryMerge.dropRequestId
  });

  assert.equal(getLatestChatConversationRun(state, "conversation-a"), null);

  const cancelledMessagesB = getLatestChatConversationRun(state, conversationB)?.messages ?? [];

  state = chatConversationRunReducer(state, {
    type: "run/cancel",
    requestId: requestB,
    messages: cancelledMessagesB,
    error: null,
    updatedAt: startedAt + 5
  });

  const stateAfterCancel = state;

  state = updateChatConversationRunMessages(
    state,
    requestB,
    (messages) => messages.map((item) => (
      item.id === `${requestB}-assistant`
        ? { ...item, content: "late token must be ignored" }
        : item
    )),
    startedAt + 6
  );

  assert.strictEqual(state, stateAfterCancel);
  assert.equal(getLatestChatConversationRun(state, conversationB)?.phase, "cancelled");
  assert.equal(getLatestChatConversationRun(state, conversationB)?.messages[1]?.content, "");

  state = chatConversationRunReducer(state, { type: "run/clear" });

  assert.deepEqual(state, createEmptyChatConversationRunState());
  assert.equal(getLatestChatConversationRun(state, conversationB), null);

  console.log("Chat conversation run state tests passed.");
}

main();
