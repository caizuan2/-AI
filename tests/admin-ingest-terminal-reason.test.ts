import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import {
  markAdminIngestConversationCompleted,
  markAdminIngestConversationRequestTerminal,
  type AdminIngestConversationRuntimeStatusMap
} from "../lib/enterprise/admin-ingest-conversation-runtime-status";

const source = readFileSync("components/enterprise-admin/IngestModeToggle.tsx", "utf8").replace(/\r\n/g, "\n");
const expireStart = source.indexOf("    const expireDoubaoVisibleBudget =");
const expireEnd = source.indexOf("    if (\n      shouldApplyAdminIngestVisibleBudget", expireStart);
const finalStart = source.indexOf("      if (successRendered && !abortController.signal.aborted)");
const finalEnd = source.indexOf("      if (abortControllerByConversationRef.current[conversationId] === abortController)", finalStart);
assert.ok(expireStart > 0 && expireEnd > expireStart && finalStart > 0 && finalEnd > finalStart);
function compile(value: string) { return ts.transpileModule(value, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText; }
const createExpiry = new Function("context", `with (context) { ${compile(source.slice(expireStart, expireEnd))} return expireDoubaoVisibleBudget; }`);
const finalize = new Function("context", `with (context) { ${compile(source.slice(finalStart, finalEnd))} }`);

function harness() {
  let statuses: AdminIngestConversationRuntimeStatusMap = {
    conversation: { state: "generating", requestId: "request", startedAt: 1, updatedAt: 1 }
  };
  const operations: Array<{ operation: string; requestId: string; historyScope: string }> = [];
  const controller = new AbortController();
  const cancelled = new Set<string>();
  const context = {
    visibleReplyRendered: false, successRendered: false,
    latestStreamedReplyMarkdown: "",
    doubaoVisibleBudgetTimedOut: false,
    abortController: controller,
    isRequestCancelled: () => cancelled.has("request"),
    isCurrentRequest: () => statuses.conversation.requestId === "request",
    cancelledIngestRequestIdsRef: { current: cancelled },
    requestId: "request", conversationId: "conversation", requestHistoryScope: "account-1",
    currentModelLabel: "Doubao", isRequestConversationVisible: () => false,
    markAdminIngestConversationCompleted, markAdminIngestConversationRequestTerminal,
    setConversationRuntimeStatusById: (update: (current: AdminIngestConversationRuntimeStatusMap) => AdminIngestConversationRuntimeStatusMap) => { statuses = update(statuses); },
    persistConversationRuntimeStatusAtomically: (operation: typeof operations[number]) => { operations.push(operation); },
    commitDoubaoVisibleTimeout: () => {
      statuses = markAdminIngestConversationRequestTerminal(statuses, { conversationId: "conversation", requestId: "request", state: "timed_out" });
    },
    createAdminIngestDoubaoVisibleTimeoutError: () => new Error("ADMIN_INGEST_DOUBAO_VISIBLE_ANSWER_TIMEOUT")
  };
  return { context, expire: createExpiry(context) as () => void, controller, cancelled, operations,
    statuses: () => statuses, replaceStatus: (value: AdminIngestConversationRuntimeStatusMap) => { statuses = value; } };
}

const timeout = harness();
timeout.expire();
finalize(timeout.context);
assert.equal(timeout.statuses().conversation.state, "timed_out");
assert.equal(timeout.operations[0].operation, "mark_runtime_timed_out", "server state must match the timeout card, not classify the timeout abort as user stop");

const stopFirst = harness();
stopFirst.cancelled.add("request");
stopFirst.controller.abort(new DOMException("user stopped", "AbortError"));
stopFirst.expire();
finalize(stopFirst.context);
assert.equal(stopFirst.context.doubaoVisibleBudgetTimedOut, false);
assert.equal(stopFirst.statuses().conversation.state, "stopped");
assert.equal(stopFirst.operations[0].operation, "mark_runtime_stopped");

const timeoutFirst = harness();
timeoutFirst.expire();
timeoutFirst.cancelled.add("request");
finalize(timeoutFirst.context);
assert.equal(timeoutFirst.statuses().conversation.state, "timed_out");
assert.equal(timeoutFirst.operations[0].operation, "mark_runtime_timed_out");

const complete = harness();
complete.context.successRendered = true;
complete.context.visibleReplyRendered = true;
complete.expire();
finalize(complete.context);
assert.equal(complete.controller.signal.aborted, false);
assert.equal(complete.statuses().conversation.state, "completed_unread");
assert.equal(complete.operations.length, 0, "completed body / metadata work must not gain a stop or timeout mutation");

const visibleComplete = harness();
visibleComplete.context.successRendered = true;
visibleComplete.context.visibleReplyRendered = true;
visibleComplete.context.isRequestConversationVisible = () => true;
visibleComplete.expire();
finalize(visibleComplete.context);
assert.equal(visibleComplete.statuses().conversation.state, "visible_completed");
assert.equal(visibleComplete.controller.signal.aborted, false);
assert.equal(visibleComplete.operations.length, 0);

const replacedBeforeExpiry = harness();
replacedBeforeExpiry.replaceStatus({ conversation: { state: "generating", requestId: "replacement", startedAt: 3, updatedAt: 3 } });
replacedBeforeExpiry.expire();
assert.equal(replacedBeforeExpiry.context.doubaoVisibleBudgetTimedOut, false);
assert.equal(replacedBeforeExpiry.controller.signal.aborted, false);
assert.equal(replacedBeforeExpiry.statuses().conversation.state, "generating");
assert.equal(replacedBeforeExpiry.statuses().conversation.requestId, "replacement");
assert.equal(replacedBeforeExpiry.operations.length, 0);

const failed = harness();
finalize(failed.context);
assert.equal(failed.statuses().conversation.state, "failed");
assert.equal(failed.operations[0].operation, "mark_runtime_failed");

const late = harness();
late.expire();
late.replaceStatus({ conversation: { state: "generating", requestId: "replacement", startedAt: 3, updatedAt: 3 } });
finalize(late.context);
assert.equal(late.statuses().conversation.requestId, "replacement");
assert.equal(late.statuses().conversation.state, "generating");
assert.equal(late.operations[0].requestId, "request", "late cleanup must remain scoped to the old server request");
assert.equal(late.operations[0].historyScope, "account-1");
assert.equal(late.operations[0].operation, "mark_runtime_timed_out");

console.log("Admin ingest terminal reason tests passed.");
