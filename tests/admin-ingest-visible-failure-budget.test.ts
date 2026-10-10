import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import type { IngestChatMessage } from "../lib/enterprise/mock-chat";
import {
  createEmptyConversationState,
  countActiveIngestConversationRequests
} from "../lib/enterprise/ingest-conversation-state";
import { completeAssistantMessage, failAssistantMessage } from "../lib/enterprise/ingest-message-reducer";
import { failRequest } from "../lib/enterprise/ingest-request-queue";
import { replaceIngestRetryOutcome } from "../lib/enterprise/ingest-retry-state";
import {
  markAdminIngestConversationRequestTerminal,
  type AdminIngestConversationRuntimeStatusMap
} from "../lib/enterprise/admin-ingest-conversation-runtime-status";
import {
  ADMIN_INGEST_DOUBAO_VISIBLE_TIMEOUT_CODE,
  createAdminIngestDoubaoVisibleTimeoutError
} from "../lib/enterprise/admin-ingest-doubao-visible-budget";

const source = readFileSync("components/enterprise-admin/IngestModeToggle.tsx", "utf8").replace(/\r\n/g, "\n");
function between(start: string, end: string) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  assert.ok(first > 0 && last > first, `missing production block: ${start}`);
  return source.slice(first, last);
}
function compile(value: string) {
  return ts.transpileModule(value, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
}
const failureCode = between("    const commitIncompleteVisibleReplyFailure =", "    // Visible original SLO");
const expiryCode = between("    const expireDoubaoVisibleBudget =", "    if (\n      shouldApplyAdminIngestVisibleBudget");
const createHandlers = new Function("context", `with (context) { ${compile(failureCode + expiryCode)} return { commitIncompleteVisibleReplyFailure, expireDoubaoVisibleBudget }; }`);
const retainMetadataFailure = new Function("context", `with (context) { ${compile(between("      if (visibleReplyRendered && visibleReplySnapshot) {", "      if (requestWasCancelled && !doubaoVisibleBudgetTimedOut)"))} }`);
const restoreMessages = new Function("context", `with (context) { ${compile(between("function markMessageCompleted(", "function getPersistableMessages("))} return normalizeRestoredMessages; }`)({}) as (messages: IngestChatMessage[]) => IngestChatMessage[];

function harness(provider = "doubao-pro", partial = "\n# 原文片段\n客户最后一句：请问下一步") {
  const assistantMessageId = "assistant-request";
  const conversationId = "conversation";
  const requestId = "request";
  const history: IngestChatMessage = { id: "old-complete", role: "assistant", content: "原有成功回答", time: "10:00", status: "completed" };
  const user: IngestChatMessage = { id: "user-request", role: "user", content: "保留全部输入事实", time: "10:01", status: "completed" };
  let messages: IngestChatMessage[] = [history, user, { id: assistantMessageId, role: "assistant", content: partial, time: "10:02", status: "streaming", isStreaming: true }];
  const state = createEmptyConversationState({ conversationId, messages: [{
    id: assistantMessageId, role: "assistant", content: partial, status: "streaming", requestId, conversationId, createdAt: 1
  }] });
  state.activeRequestId = requestId;
  state.isGenerating = true;
  const conversationStateByIdRef = { current: { [conversationId]: state } };
  const activeIngestRequestIdByConversationRef = { current: { [conversationId]: requestId } };
  const abortController = new AbortController();
  let statuses: AdminIngestConversationRuntimeStatusMap = { [conversationId]: { state: "generating", requestId, startedAt: 1, updatedAt: 1 } };
  const persisted: IngestChatMessage[][] = [];
  const notices: string[] = [];
  const errors: string[] = [];
  const context = {
    assistantMessageId, conversationId, requestId, conversationStateByIdRef,
    activeIngestRequestIdByConversationRef, abortController,
    abortControllerByConversationRef: { current: { [conversationId]: abortController } },
    requestQueueRef: { current: { [conversationId]: { activeRequestId: requestId } } },
    currentModelLabel: "当前所选模型", requestModelOption: { provider },
    latestStreamedReplyMarkdown: partial, visibleReplyRendered: false,
    visibleReplySnapshot: "", successRendered: false,
    doubaoVisibleBudgetTimedOut: false, doubaoVisibleTimeoutCommitted: false,
    doubaoVisibleBudgetSeconds: 60, requestHistoryScope: "same-account",
    options: undefined, platformContext: { platform: "web", syncTarget: ["web"] },
    tenantId: null, userId: "owner", activeAgent: { id: "agent", name: "专家", expertId: null },
    isCurrentRequest: () => activeIngestRequestIdByConversationRef.current[conversationId] === requestId,
    isRequestCancelled: () => false, isRequestConversationVisible: () => false,
    failAssistantMessage, completeAssistantMessage, replaceIngestRetryOutcome, failRequest,
    markAdminIngestConversationRequestTerminal, countActiveIngestConversationRequests,
    createAdminIngestDoubaoVisibleTimeoutError, ADMIN_INGEST_DOUBAO_VISIBLE_TIMEOUT_CODE,
    commitRequestMessages: (update: (current: IngestChatMessage[]) => IngestChatMessage[]) => { messages = update(messages); return messages; },
    persistConversationMessagesAtomically: ({ messages: next }: { messages: IngestChatMessage[] }) => { persisted.push(next); },
    setConversationRuntimeStatusById: (update: (current: AdminIngestConversationRuntimeStatusMap) => AdminIngestConversationRuntimeStatusMap) => { statuses = update(statuses); },
    setIsParsing: () => undefined, setRequestFallbackToast: () => undefined,
    setRequestNoticeMessage: (value: string) => notices.push(value),
    setRequestErrorMessage: (value: string) => errors.push(value),
    showRequestActionToast: () => undefined, rawErrorMessage: "metadata connection interrupted"
  };
  const handlers = createHandlers(context) as {
    expireDoubaoVisibleBudget: () => void;
    commitIncompleteVisibleReplyFailure: (input: { message: string; failureMeta: NonNullable<IngestChatMessage["failureMeta"]>; terminalState: "failed" }) => void;
  };
  return { context, handlers, persisted, notices, errors, messages: () => messages, statuses: () => statuses };
}

for (const provider of ["doubao-pro", "deepseek-pro", "deepseek-flash"]) {
  const pending = harness(provider);
  pending.handlers.expireDoubaoVisibleBudget();
  assert.equal(pending.context.visibleReplyRendered, false);
  assert.equal(pending.context.successRendered, false);
  assert.equal(pending.context.abortController.signal.aborted, true);
  assert.equal(pending.context.conversationStateByIdRef.current.conversation.messages[0].status, "failed", "nonempty shared-reducer fallback must not mark an unfinished preview complete");
  const failed = pending.messages().find((item) => item.id === "assistant-request")!;
  assert.equal(failed.content, pending.context.latestStreamedReplyMarkdown);
  assert.equal(failed.status, "failed");
  assert.equal(failed.metadataState, "unavailable");
  assert.equal(failed.saveSuggestion, false);
  assert.equal(failed.failureMeta?.retryable, true);
  assert.equal(failed.failureMeta?.requestedModel, pending.context.currentModelLabel);
  assert.equal(failed.failureMeta?.actualModel, pending.context.currentModelLabel);
  assert.equal(failed.failureMeta?.fallbackUsed, false);
  assert.equal(pending.messages().filter((item) => item.id === "assistant-request").length, 1);
  assert.equal(pending.messages()[0].content, "原有成功回答");
  assert.equal(pending.messages()[1].content, "保留全部输入事实");
  assert.equal(pending.statuses().conversation.state, "timed_out");
  assert.match(pending.errors[0], /未形成完整正文/);
  assert.equal(pending.persisted.length, 1);
  const restored = restoreMessages(JSON.parse(JSON.stringify(pending.persisted[0])) as IngestChatMessage[]);
  assert.equal(restored.at(-1)?.status, "failed");
  assert.equal(restored.at(-1)?.content, failed.content);
  assert.equal(restored.at(-1)?.failureMeta?.retryable, true);
  pending.handlers.expireDoubaoVisibleBudget();
  assert.equal(pending.persisted.length, 1, "late timeout cannot duplicate a persistent failure");
}

const interrupted = harness();
interrupted.handlers.commitIncompleteVisibleReplyFailure({
  message: "上游正文未完整返回", failureMeta: { title: "返回中断", retryable: true, requestedModel: "当前所选模型", actualModel: "当前所选模型", fallbackUsed: false }, terminalState: "failed"
});
assert.equal(interrupted.messages().at(-1)?.status, "failed");
assert.equal(interrupted.persisted[0].at(-1)?.content, interrupted.context.latestStreamedReplyMarkdown);
assert.equal(interrupted.statuses().conversation.state, "failed");

const complete = harness("deepseek-pro", "# 完整模型正文\n结论和全部步骤已经结束。");
complete.context.visibleReplyRendered = true;
complete.context.visibleReplySnapshot = complete.context.latestStreamedReplyMarkdown;
complete.handlers.expireDoubaoVisibleBudget();
assert.equal(complete.context.abortController.signal.aborted, false);
assert.equal(complete.persisted.length, 0);
retainMetadataFailure(complete.context);
assert.equal(complete.messages().at(-1)?.status, "completed");
assert.equal(complete.messages().at(-1)?.content, complete.context.visibleReplySnapshot);
assert.equal(complete.messages().at(-1)?.metadataState, "unavailable");
assert.equal(complete.messages().at(-1)?.saveSuggestion, false);
assert.equal(complete.persisted.length, 1, "complete body / failed metadata distinction must survive refresh");

assert.doesNotMatch(expiryCode, /completeAssistantMessage|status: "completed"|model_completed/);
assert.match(source, /if \(event\.truncated\) \{[\s\S]*?latestStreamedReplyMarkdown = event\.replyMarkdown;[\s\S]*?throw new Error/);
assert.match(source, /if \(!visibleReplyRendered && latestStreamedReplyMarkdown\.trim\(\) && !requestWasCancelled\)/);
assert.match(source, /maxChars: MAX_INGEST_CONTEXT_CHARS/);
assert.doesNotMatch(source, /INGEST_REQUEST_CONTEXT_MAX_CHARS/);
console.log("Admin ingest persistent partial failure, shared OCR budget and frozen context tests passed.");
