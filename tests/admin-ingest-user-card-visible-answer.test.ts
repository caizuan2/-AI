import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  hasVisibleReplyForActiveIngestRequest,
  hasVisibleReplyForActiveIngestProvider,
  shouldShowAdminIngestAnswerActions,
  shouldShowAdminIngestParsingProgress
} from "../lib/enterprise/admin-ingest-visible-answer-state";
import type { IngestConversationState } from "../lib/enterprise/ingest-conversation-state";

function makeConversationState(input: {
  activeRequestId?: string;
  messages?: IngestConversationState["messages"];
}): IngestConversationState {
  return {
    conversationId: "conversation-current",
    messages: input.messages ?? [],
    activeRequestId: input.activeRequestId,
    isGenerating: Boolean(input.activeRequestId),
    updatedAt: Date.now()
  };
}

test("visible reply detection is scoped to the active request", () => {
  const state = makeConversationState({
    activeRequestId: "request-current",
    messages: [
      {
        id: "assistant-old",
        role: "assistant",
        content: "旧对话正文",
        requestId: "request-old",
        conversationId: "conversation-current",
        createdAt: 1
      },
      {
        id: "assistant-current",
        role: "assistant",
        content: "",
        requestId: "request-current",
        conversationId: "conversation-current",
        createdAt: 2
      }
    ]
  });

  assert.equal(hasVisibleReplyForActiveIngestRequest(state), false);

  state.messages[1] = {
    ...state.messages[1],
    content: "DeepSeek 已经返回可见正文",
    meta: { provider: "deepseek-pro" }
  };

  assert.equal(hasVisibleReplyForActiveIngestRequest(state), true);
  assert.equal(
    hasVisibleReplyForActiveIngestProvider(state, ["deepseek", "deepseek-pro"]),
    true,
    "只读取当前请求的 DeepSeek 已展示正文，不读取旧消息或其他模型。"
  );
  assert.equal(hasVisibleReplyForActiveIngestProvider(state, ["doubao-pro"]), false);
});

test("DeepSeek visible reply hides only the client progress UI while other full-ingest flows keep their existing behavior", () => {
  assert.equal(shouldShowAdminIngestParsingProgress({
    isParsing: true,
    isRequestActive: true,
    hasFullIngestAccess: false,
    hasVisibleReply: false
  }), true, "正文出现前仍应给用户生成反馈");

  assert.equal(shouldShowAdminIngestParsingProgress({
    isParsing: true,
    isRequestActive: true,
    hasFullIngestAccess: false,
    hasVisibleReply: true
  }), false, "用户卡正文出现后不再显示知识整理进度");

  assert.equal(shouldShowAdminIngestParsingProgress({
    isParsing: true,
    isRequestActive: true,
    hasFullIngestAccess: true,
    hasVisibleReply: true
  }), true, "未指定 UI 隐藏条件的投喂流程保持原有进度显示。");

  assert.equal(shouldShowAdminIngestParsingProgress({
    isParsing: true,
    isRequestActive: true,
    hasFullIngestAccess: true,
    hasVisibleReply: true,
    hideWhenVisibleReply: true
  }), false, "DeepSeek 正文已显示时必须隐藏已思考提示，不影响请求本身。"
  );
});

test("chat-only shows answer actions from visible body without waiting for metadata", () => {
  const pendingAnswer = {
    role: "assistant",
    messageId: "assistant-result-current",
    content: "已经可以复制的豆包正文",
    metadataState: "pending" as const
  };

  assert.equal(shouldShowAdminIngestAnswerActions({
    ...pendingAnswer,
    hasFullIngestAccess: false
  }), true);
  assert.equal(shouldShowAdminIngestAnswerActions({
    ...pendingAnswer,
    hasFullIngestAccess: true
  }), false, "投喂卡仍等待结构化知识整理完成");
  assert.equal(shouldShowAdminIngestAnswerActions({
    ...pendingAnswer,
    content: "",
    hasFullIngestAccess: false
  }), false, "空正文不能提前显示操作按钮");
});

test("shell reuses the four-button action row and hides metadata status only for user cards", () => {
  const shell = readFileSync("components/enterprise-admin/IngestChatGPTShell.tsx", "utf8");
  const actions = readFileSync("components/enterprise-admin/IngestKnowledgeDraftActions.tsx", "utf8");
  const modeToggle = readFileSync("components/enterprise-admin/IngestModeToggle.tsx", "utf8");

  assert.match(shell, /shouldShowAdminIngestAnswerActions\(\{/);
  assert.match(shell, /\{canUseFullIngestTools \? \(\s*message\.metadataState === "pending"/);
  assert.match(actions, /title="复制" aria-label="复制"/);
  assert.match(actions, /title=\{isParsing \? "生成中" : "重新生成"\}/);
  assert.match(actions, /\{feedbackActions\}/);
  assert.match(actions, /\{canSaveKnowledge \? \(/);
  assert.match(modeToggle, /hasVisibleReplyForActiveIngestRequest\(/);
  assert.match(modeToggle, /hasVisibleReplyForActiveIngestProvider\([\s\S]*?\["deepseek", "deepseek-pro"\]/);
  assert.match(modeToggle, /hideWhenVisibleReply: hasVisibleDeepSeekReplyForActiveRequest/);
  assert.match(modeToggle, /shouldShowAdminIngestParsingProgress\(\{/);
});
