import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { resolveIngestRegenerateRequest } from "../lib/enterprise/ingest-retry-state";
import {
  createIngestQueueState,
  enqueueRequest,
  getNextQueuedRequest
} from "../lib/enterprise/ingest-request-queue";

const root = process.cwd();
const modeToggleSource = fs.readFileSync(
  path.join(root, "components/enterprise-admin/IngestModeToggle.tsx"),
  "utf8"
);
const shellSource = fs.readFileSync(
  path.join(root, "components/enterprise-admin/IngestChatGPTShell.tsx"),
  "utf8"
);

test("ordinary regenerate reuses the original visible user request and replaces the target answer", () => {
  const request = resolveIngestRegenerateRequest([
    { id: "user-1", role: "user", content: "帮我整理客户需求" },
    { id: "assistant-1", role: "assistant", content: "旧答案" }
  ], "assistant-1");

  assert.deepEqual(request, {
    visibleInput: "帮我整理客户需求",
    reuseUserMessageId: "user-1",
    replaceAssistantMessageId: "assistant-1",
    retryAttachments: []
  });
});

test("wechat full-answer regenerate preserves its attachment mode without exposing model instructions", () => {
  const attachment = {
    id: "wechat-full",
    recognitionMode: "wechat_conversation",
    wechatOutputMode: "full_answer",
    extractedText: "完整 OCR 证据"
  } as const;
  const request = resolveIngestRegenerateRequest([
    {
      id: "user-full",
      role: "user",
      content: "微信截图识别并输出完整答案",
      attachments: [attachment]
    },
    { id: "assistant-full", role: "assistant", content: "旧完整答案" }
  ], "assistant-full");

  assert.equal(request?.visibleInput, "微信截图识别并输出完整答案");
  assert.equal(request?.retryAttachments[0]?.wechatOutputMode, "full_answer");
  assert.equal(request?.retryAttachments[0]?.extractedText, "完整 OCR 证据");
  assert.doesNotMatch(request?.visibleInput ?? "", /固定规则|左侧头像|OCR 原文/);
});

test("wechat precise-reply regenerate preserves its attachment mode and original visible question", () => {
  const request = resolveIngestRegenerateRequest([
    {
      id: "user-precise",
      role: "user",
      content: "帮我精准回复这位客户",
      attachments: [{
        id: "wechat-precise",
        recognitionMode: "wechat_conversation",
        wechatOutputMode: "precise_reply"
      }]
    },
    { id: "assistant-precise", role: "assistant", content: "旧精准话术" }
  ], "assistant-precise");

  assert.equal(request?.visibleInput, "帮我精准回复这位客户");
  assert.equal(request?.retryAttachments[0]?.wechatOutputMode, "precise_reply");
});

test("model receives the effective prompt while UI, history and regenerate state use visible input", () => {
  assert.match(modeToggleSource, /固定规则：左侧头像或白色气泡是客户/);
  assert.match(modeToggleSource, /text: effectiveInput/);
  assert.match(modeToggleSource, /prompt: effectiveInput/);
  assert.match(modeToggleSource, /content: visibleInput/);
  assert.match(
    modeToggleSource,
    /requestMessagesSnapshot\.filter\(\(message\) => message\.id !== options\?\.failedMessageId\)/
  );
  assert.match(modeToggleSource, /conversationLastInputByIdRef\.current\[conversationId\] = visibleInput/);
  assert.match(modeToggleSource, /setLastInput\(visibleInput\)/);
  assert.match(modeToggleSource, /enqueueRequest[\s\S]*visibleInput,[\s\S]*createdAt: sendAttemptAt/);
  assert.match(modeToggleSource, /current \|\| queuedRequest\.visibleInput/);
  assert.doesNotMatch(modeToggleSource, /queuedRequest\.prompt/);
  assert.match(modeToggleSource, /onRegenerateMessage: handleRegenerateMessage/);
  assert.match(shellSource, /onRegenerateMessage\(messageId\)/);
  assert.match(shellSource, /handleRegenerate\(message\.id, message\.content\)/);
});

test("queued sends retain only composer-safe visible input", () => {
  const queue = enqueueRequest(createIngestQueueState(), {
    conversationId: "conversation-wechat",
    visibleInput: "微信截图识别并输出完整答案",
    createdAt: 1
  });
  const queuedRequest = getNextQueuedRequest(queue, "conversation-wechat");

  assert.equal(queuedRequest?.visibleInput, "微信截图识别并输出完整答案");
  assert.doesNotMatch(
    JSON.stringify(queuedRequest),
    /固定规则|左侧头像|右侧消息只作上下文|OCR 原文/
  );
});
