import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  hasRenderedAdminIngestReply,
  normalizeAdminIngestVisibleReply
} from "../lib/enterprise/admin-ingest-visible-reply";

const reply = "姐，看到您说聊天带来福气，我心里也暖暖的。您最近开始分享，是遇到了什么特别的人或事吗？";
const structuredResponse = JSON.stringify({
  replyMarkdown: reply,
  knowledgeDraft: {
    title: "内部知识草稿",
    summary: "这部分不能展示给客户。"
  }
});
const malformedTail = `${structuredResponse.slice(0, -2)}, "standardAnswers": [`;

test("DeepSeek visible reply extracts only replyMarkdown from structured output", () => {
  assert.equal(
    normalizeAdminIngestVisibleReply(structuredResponse, "deepseek"),
    reply
  );
  assert.equal(
    normalizeAdminIngestVisibleReply(malformedTail, "deepseek-pro"),
    reply,
    "即使外层 JSON 尾部损坏，也只能展示已经完整闭合的 replyMarkdown。"
  );
});

test("Doubao and ordinary DeepSeek text remain byte-for-byte unchanged", () => {
  assert.equal(
    normalizeAdminIngestVisibleReply(structuredResponse, "doubao-pro"),
    structuredResponse,
    "豆包原文透传链路不受此次 DeepSeek UI 修复影响。"
  );
  assert.equal(
    normalizeAdminIngestVisibleReply(reply, "deepseek-pro"),
    reply
  );
});

test("rendered reply is request-scoped before suppressing the terminal progress UI", () => {
  const messages = [{
    id: "assistant-result-request-current",
    role: "assistant",
    content: reply
  }];

  assert.equal(hasRenderedAdminIngestReply({
    messages,
    requestId: "request-current"
  }), true);
  assert.equal(hasRenderedAdminIngestReply({
    messages,
    requestId: "request-old"
  }), false);
});

test("admin ingest finalizes DeepSeek UI before cloud history persistence completes", () => {
  const toggleSource = readFileSync(
    "components/enterprise-admin/IngestModeToggle.tsx",
    "utf8"
  );
  const persistenceStart = toggleSource.indexOf(
    "const completedMessagePersistence = persistConversationMessagesAtomically"
  );
  const visibleCommit = toggleSource.indexOf(
    "commitRequestMessages(() => finalizedMessages)",
    persistenceStart
  );
  const persistenceAwait = toggleSource.indexOf(
    "await completedMessagePersistence",
    persistenceStart
  );

  assert.ok(persistenceStart >= 0);
  assert.ok(visibleCommit > persistenceStart);
  assert.ok(
    persistenceAwait > visibleCommit,
    "正文和终止状态必须先进入 UI，再等待后台历史同步。"
  );
  assert.match(toggleSource, /isParsing:\s*activeConversationUiIsParsing/);
  assert.match(toggleSource, /hideWhenVisibleReply:\s*hasVisibleDeepSeekTerminalReply/);
});

test("attachment preview retries transient permanent-image reads without exposing a broken image", () => {
  const previewSource = readFileSync(
    "components/enterprise-admin/IngestAttachmentPreview.tsx",
    "utf8"
  );

  assert.match(previewSource, /retryAdminIngestAttachmentImage/);
  assert.match(previewSource, /ingestImageRetry=/);
  assert.match(previewSource, /image\.style\.opacity = "0"/);
});
