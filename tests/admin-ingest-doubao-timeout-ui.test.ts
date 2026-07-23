import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  AdminIngestRequestError,
  isRetryableDoubaoStrictModelFailure,
  isStrictSelectedModelFailure,
  readAdminIngestRequestError
} from "@/lib/enterprise/admin-ingest-request-error";
import { buildAdminIngestFailurePresentation } from "@/lib/enterprise/admin-ingest-failure-presentation";
import { sendCoreIngest } from "@/lib/enterprise/ingest-client";
import { isRetryableIngestError } from "@/lib/enterprise/ingest-request-controller";
import {
  excludeFailedIngestMessages,
  replaceIngestRetryOutcome,
  resolveIngestSendAttachments
} from "@/lib/enterprise/ingest-retry-state";
import {
  getStateDomain,
  isRealIngestFailure,
  shouldSuppressFallbackToast
} from "@/lib/enterprise/ingest-ui-state";

async function main() {
  assert.equal(isRetryableDoubaoStrictModelFailure("DOUBAO_TIMEOUT"), true);
  assert.equal(isRetryableDoubaoStrictModelFailure("DOUBAO_RESPONSE_PARSE_FAILED"), true);
  assert.equal(isRetryableDoubaoStrictModelFailure("DOUBAO_RATE_LIMITED"), true);
  assert.equal(isRetryableDoubaoStrictModelFailure("DOUBAO_REQUEST_FAILED"), true);
  assert.equal(isRetryableDoubaoStrictModelFailure("DOUBAO_QUOTA_EXCEEDED"), false);
  assert.equal(isRetryableDoubaoStrictModelFailure("DOUBAO_MODEL_UNAVAILABLE"), false);
  assert.equal(isRetryableDoubaoStrictModelFailure("DOUBAO_BASE_URL_INVALID"), false);
  assert.equal(isRetryableDoubaoStrictModelFailure("DOUBAO_API_KEY_INVALID"), false);

  const error = new AdminIngestRequestError(
    "Doubao-Seed-2.1-pro 暂时不可用，系统未切换其他模型。",
    {
      status: 504,
      errorCode: "ADMIN_INGEST_SELECTED_MODEL_UNAVAILABLE",
      causeCode: "DOUBAO_TIMEOUT",
      retryable: true,
      provider: "doubao-pro",
      requestedProvider: "doubao-pro",
      actualProvider: null,
      selectedModelLabel: "Doubao-Seed-2.1-pro",
      requestedModel: "doubao-seed-2-1-pro-260628",
      actualModel: null,
      fallbackUsed: false,
      requestId: "request-timeout-contract"
    }
  );
  const details = readAdminIngestRequestError(error);

  assert.ok(details);
  assert.equal(details.status, 504);
  assert.equal(details.errorCode, "ADMIN_INGEST_SELECTED_MODEL_UNAVAILABLE");
  assert.equal(details.causeCode, "DOUBAO_TIMEOUT");
  assert.equal(details.retryable, true);
  assert.equal(details.requestedProvider, "doubao-pro");
  assert.equal(details.requestedModel, "doubao-seed-2-1-pro-260628");
  assert.equal(details.fallbackUsed, false);
  assert.equal(getStateDomain(error), "ingest");
  assert.equal(isStrictSelectedModelFailure(error), true);
  assert.equal(isRetryableIngestError(error), true);
  const timeoutPresentation = buildAdminIngestFailurePresentation(error, "Doubao-Seed-2.1-pro");
  assert.equal(timeoutPresentation.title, "Doubao-Seed-2.1-pro 响应超时");
  assert.equal(timeoutPresentation.retryable, true);
  assert.match(timeoutPresentation.message, /本轮等待模型响应超时/);
  assert.match(timeoutPresentation.message, /系统未切换其他模型/);
  assert.doesNotMatch(timeoutPresentation.message, /系统正在自动优化/);
  assert.equal(isRealIngestFailure({
    reason: error.message,
    stateDomain: getStateDomain(error),
    status: details.status,
    errorCode: details.errorCode,
    causeCode: details.causeCode,
    retryable: details.retryable
  }), true);

  const currentStrictTimeout = {
    reason: error.message,
    stateDomain: "ingest" as const,
    requestId: "request-current-timeout",
    activeRequestId: "request-current-timeout",
    suppressUntil: Date.now() + 30_000,
    status: 504,
    errorCode: "ADMIN_INGEST_SELECTED_MODEL_UNAVAILABLE",
    causeCode: "DOUBAO_TIMEOUT",
    retryable: true
  };
  assert.equal(
    shouldSuppressFallbackToast(currentStrictTimeout),
    false,
    "A current strict-model timeout must bypass the prior-success toast window so its failure card persists."
  );
  assert.equal(isRealIngestFailure(currentStrictTimeout), true);
  assert.equal(
    shouldSuppressFallbackToast({
      ...currentStrictTimeout,
      requestId: "request-stale-timeout"
    }),
    true,
    "A stale strict-model timeout must remain suppressed."
  );
  assert.equal(
    shouldSuppressFallbackToast({
      ...currentStrictTimeout,
      hasCurrentSuccess: true
    }),
    true,
    "A strict-model timeout must not replace a success already committed for the same request."
  );

  const currentNetworkFailure = {
    reason: "Failed to fetch",
    stateDomain: "ingest" as const,
    requestId: "request-current-network-failure",
    activeRequestId: "request-current-network-failure",
    suppressUntil: Date.now() + 30_000,
    status: 503,
    errorCode: "NETWORK_ERROR",
    retryable: true
  };
  assert.equal(
    shouldSuppressFallbackToast(currentNetworkFailure),
    false,
    "The prior-success window must not hide a real failure from the current active request."
  );
  assert.equal(isRealIngestFailure(currentNetworkFailure), true);

  assert.equal(isRetryableIngestError(new AdminIngestRequestError("请先登录", {
    status: 401,
    errorCode: "AUTH_REQUIRED",
    retryable: false
  })), false);

  const nonRetryableAuthPresentation = buildAdminIngestFailurePresentation(
    new AdminIngestRequestError("raw token sk-secret must not be displayed", {
      status: 401,
      errorCode: "ADMIN_INGEST_SELECTED_MODEL_UNAVAILABLE",
      causeCode: "DOUBAO_API_KEY_INVALID",
      retryable: false,
      selectedModelLabel: "Doubao-Seed-2.1-pro",
      requestedModel: "doubao-seed-2-1-pro-260628",
      actualModel: null,
      fallbackUsed: false
    }),
    "Doubao-Seed-2.1-pro"
  );
  assert.equal(nonRetryableAuthPresentation.retryable, false);
  assert.match(nonRetryableAuthPresentation.message, /模型授权或连接配置不可用/);
  assert.doesNotMatch(nonRetryableAuthPresentation.message, /sk-secret|raw token/);
  const invalidKeyModelError = new AdminIngestRequestError("模型连接配置不可用", {
    status: 401,
    errorCode: "ADMIN_INGEST_SELECTED_MODEL_UNAVAILABLE",
    causeCode: "DOUBAO_API_KEY_INVALID",
    retryable: false,
    selectedModelLabel: "Doubao-Seed-2.1-pro"
  });
  const invalidKeyGuard = {
    reason: invalidKeyModelError.message,
    stateDomain: getStateDomain(invalidKeyModelError),
    requestId: "request-current-invalid-key",
    activeRequestId: "request-current-invalid-key",
    status: 401,
    errorCode: "ADMIN_INGEST_SELECTED_MODEL_UNAVAILABLE",
    causeCode: "DOUBAO_API_KEY_INVALID",
    retryable: false
  } as const;
  assert.equal(invalidKeyGuard.stateDomain, "ingest");
  assert.equal(shouldSuppressFallbackToast(invalidKeyGuard), false);
  assert.equal(isRealIngestFailure(invalidKeyGuard), true);

  const streamPresentation = buildAdminIngestFailurePresentation(
    new AdminIngestRequestError("stream terminated", {
      status: 502,
      errorCode: "ADMIN_INGEST_SELECTED_MODEL_UNAVAILABLE",
      causeCode: "DOUBAO_RESPONSE_PARSE_FAILED",
      retryable: true,
      selectedModelLabel: "Doubao-Seed-2.1-pro"
    }),
    "Doubao-Seed-2.1-pro"
  );
  assert.equal(streamPresentation.retryable, true);
  assert.match(streamPresentation.title, /返回中断/);

  const classifiedFailures = [
    { causeCode: "DOUBAO_RATE_LIMITED", retryable: true, title: /请求繁忙/ },
    { causeCode: "DOUBAO_QUOTA_EXCEEDED", retryable: false, title: /额度暂不可用/ },
    { causeCode: "DOUBAO_SAFETY_REJECTED", retryable: false, title: /未通过模型检查/ },
    { causeCode: "DOUBAO_MODEL_UNAVAILABLE", retryable: false, title: /暂时不可用/ },
    { causeCode: "DOUBAO_REQUEST_FAILED", retryable: true, title: /连接中断/ }
  ];

  for (const item of classifiedFailures) {
    const presentation = buildAdminIngestFailurePresentation(new AdminIngestRequestError("unsafe raw provider detail", {
      status: item.retryable ? 503 : 422,
      errorCode: "ADMIN_INGEST_SELECTED_MODEL_UNAVAILABLE",
      causeCode: item.causeCode,
      retryable: item.retryable,
      selectedModelLabel: "Doubao-Seed-2.1-pro"
    }), "Doubao-Seed-2.1-pro");

    assert.equal(presentation.retryable, item.retryable);
    assert.match(presentation.title, item.title);
    assert.doesNotMatch(presentation.message, /unsafe raw provider detail|系统正在自动优化/);
  }

  const strictKnowledgeFailures = [
    {
      causeCode: "ADMIN_INGEST_GROUNDING_NO_HIT",
      status: 422,
      retryable: false,
      title: "当前 Agent 固定知识库未命中",
      message: /补充问题背景|完善当前 Agent 固定知识库/
    },
    {
      causeCode: "ADMIN_INGEST_GROUNDING_SCOPE_INVALID",
      status: 422,
      retryable: false,
      title: "当前 Agent 固定知识库作用域异常",
      message: /刷新当前 Agent|修复该 Agent 的固定知识库作用域/
    },
    {
      causeCode: "ADMIN_INGEST_GROUNDING_UNAVAILABLE",
      status: 503,
      retryable: true,
      title: "当前 Agent 固定知识库暂时不可用",
      message: /同模型重试/
    }
  ];

  for (const item of strictKnowledgeFailures) {
    const strictKnowledgeError = new AdminIngestRequestError("unsafe raw grounding detail", {
      status: item.status,
      errorCode: "ADMIN_INGEST_STRICT_KNOWLEDGE_REQUIRED",
      causeCode: item.causeCode,
      retryable: item.retryable,
      selectedModelLabel: "Doubao-Seed-2.1-pro",
      requestedModel: "doubao-seed-2-1-pro-260628",
      fallbackUsed: false
    });
    const presentation = buildAdminIngestFailurePresentation(
      strictKnowledgeError,
      "Doubao-Seed-2.1-pro"
    );
    const strictKnowledgeGuard = {
      reason: strictKnowledgeError.message,
      stateDomain: getStateDomain(strictKnowledgeError),
      requestId: `request-${item.causeCode}`,
      activeRequestId: `request-${item.causeCode}`,
      status: item.status,
      errorCode: "ADMIN_INGEST_STRICT_KNOWLEDGE_REQUIRED",
      causeCode: item.causeCode,
      retryable: item.retryable
    } as const;

    assert.equal(presentation.title, item.title);
    assert.equal(presentation.retryable, item.retryable);
    assert.match(presentation.message, item.message);
    assert.match(presentation.message, /输入和附件已保留/);
    assert.doesNotMatch(presentation.message, /unsafe raw grounding detail|检查模型连接配置/);
    assert.equal(isStrictSelectedModelFailure(strictKnowledgeError), true);
    assert.equal(getStateDomain(strictKnowledgeError), "ingest");
    assert.equal(shouldSuppressFallbackToast(strictKnowledgeGuard), false);
    assert.equal(isRealIngestFailure(strictKnowledgeGuard), true);
  }

  const networkPresentation = buildAdminIngestFailurePresentation(
    new TypeError("Failed to fetch https://example.invalid?token=secret"),
    "Doubao-Seed-2.1-pro"
  );
  assert.equal(networkPresentation.retryable, true);
  assert.match(networkPresentation.title, /连接中断/);
  assert.doesNotMatch(networkPresentation.message, /example\.invalid|token=secret/);

  const retryMessages = [
    { id: "user-original", role: "user", status: "completed" },
    { id: "assistant-failed-original", role: "assistant", status: "failed" }
  ];
  assert.deepEqual(
    excludeFailedIngestMessages(retryMessages).map((message) => message.id),
    ["user-original"],
    "Failed UI messages must never enter the next model context."
  );

  const persistedFailureMessage = JSON.parse(JSON.stringify({
    id: "assistant-failed-persisted",
    role: "assistant",
    status: "failed",
    failureMeta: {
      title: "Doubao-Seed-2.1-pro 返回中断",
      errorCode: "ADMIN_INGEST_SELECTED_MODEL_UNAVAILABLE",
      causeCode: "DOUBAO_RESPONSE_PARSE_FAILED",
      retryable: true,
      requestedModel: "doubao-seed-2-1-pro-260628",
      actualModel: null,
      fallbackUsed: false
    }
  })) as { failureMeta: { causeCode: string; retryable: boolean; fallbackUsed: boolean } };
  assert.equal(persistedFailureMessage.failureMeta.causeCode, "DOUBAO_RESPONSE_PARSE_FAILED");
  assert.equal(persistedFailureMessage.failureMeta.retryable, true);
  assert.equal(persistedFailureMessage.failureMeta.fallbackUsed, false);
  assert.equal(retryMessages.filter((message) => message.role === "user").length, 1);
  const successfulRetry = replaceIngestRetryOutcome(
    retryMessages,
    "assistant-failed-original",
    { id: "assistant-success", role: "assistant", status: "completed" }
  );
  assert.deepEqual(successfulRetry.map((message) => message.id), ["user-original", "assistant-success"]);
  assert.equal(successfulRetry.filter((message) => message.role === "user").length, 1, "Retry must not duplicate the user question.");
  const failedRetry = replaceIngestRetryOutcome(
    retryMessages,
    "assistant-failed-original",
    { id: "assistant-failed-next", role: "assistant", status: "failed" }
  );
  assert.deepEqual(failedRetry.map((message) => message.id), ["user-original", "assistant-failed-next"]);
  assert.deepEqual(
    resolveIngestSendAttachments(["new-composer-attachment"], []),
    [],
    "A historical retry without attachments must not borrow a new composer attachment."
  );
  assert.deepEqual(
    resolveIngestSendAttachments(["new-composer-attachment"], undefined),
    ["new-composer-attachment"]
  );

  const originalFetch = globalThis.fetch;
  let providerFailureMode: "timeout" | "invalid_key" = "timeout";

  globalThis.fetch = async (request) => {
    if (String(request).includes("/api/admin/kb/ingest/models/health")) {
      return new Response(JSON.stringify({
        ok: true,
        configured: true,
        provider: "doubao-pro",
        baseUrlConfigured: true,
        modelConfigured: true,
        apiKeyConfigured: true,
        selectedModelLabel: "Doubao-Seed-2.1-pro",
        model: "doubao-seed-2-1-pro-260628",
        actualModel: "doubao-seed-2-1-pro-260628",
        mode: "highest",
        message: "Doubao-Seed-2.1-pro 接口可用"
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    const invalidKey = providerFailureMode === "invalid_key";

    return new Response(JSON.stringify({
      ok: false,
      success: false,
      errorCode: "ADMIN_INGEST_SELECTED_MODEL_UNAVAILABLE",
      causeCode: invalidKey ? "DOUBAO_API_KEY_INVALID" : "DOUBAO_TIMEOUT",
      message: invalidKey ? "豆包模型密钥不可用。" : "豆包完整生成超时。",
      userMessage: invalidKey
        ? "Doubao-Seed-2.1-pro 连接配置不可用，系统未切换其他模型。"
        : "Doubao-Seed-2.1-pro 本轮响应超时，系统未切换其他模型。",
      retryable: !invalidKey,
      provider: "doubao-pro",
      requestedProvider: "doubao-pro",
      actualProvider: null,
      selectedModelLabel: "Doubao-Seed-2.1-pro",
      requestedModel: "doubao-seed-2-1-pro-260628",
      actualModel: null,
      fallbackUsed: false,
      requestId: invalidKey ? "request-send-core-invalid-key" : "request-send-core-timeout"
    }), { status: invalidKey ? 401 : 504, headers: { "Content-Type": "application/json" } });
  };

  try {
    await assert.rejects(
      () => sendCoreIngest({
        text: "豆包结构化超时穿透测试",
        category: "测试",
        model: "Doubao-Seed-2.1-pro",
        modelProvider: "doubao-pro",
        selectedModelLabel: "Doubao-Seed-2.1-pro",
        requestId: "request-send-core-timeout",
        agent: {
          id: "agent-doubao-timeout",
          name: "豆包超时测试 Agent",
          role: "测试专家",
          description: "只验证结构化错误穿透",
          avatar: "豆",
          tone: "amber",
          status: "active"
        }
      }),
      (caught: unknown) => {
        const caughtDetails = readAdminIngestRequestError(caught);

        return caught instanceof AdminIngestRequestError
          && caughtDetails?.status === 504
          && caughtDetails.errorCode === "ADMIN_INGEST_SELECTED_MODEL_UNAVAILABLE"
          && caughtDetails.causeCode === "DOUBAO_TIMEOUT"
          && caughtDetails.retryable === true
          && caughtDetails.requestedProvider === "doubao-pro"
          && caughtDetails.requestedModel === "doubao-seed-2-1-pro-260628"
          && caughtDetails.fallbackUsed === false;
      },
      "sendCoreIngest must preserve the structured Doubao timeout instead of wrapping it in Error."
    );

    providerFailureMode = "invalid_key";
    await assert.rejects(
      () => sendCoreIngest({
        text: "豆包模型密钥错误分类测试",
        category: "测试",
        model: "Doubao-Seed-2.1-pro",
        modelProvider: "doubao-pro",
        selectedModelLabel: "Doubao-Seed-2.1-pro",
        requestId: "request-send-core-invalid-key",
        agent: {
          id: "agent-doubao-invalid-key",
          name: "豆包密钥测试 Agent",
          role: "测试专家",
          description: "只验证模型密钥错误不会被误判为登录失效",
          avatar: "豆",
          tone: "amber",
          status: "active"
        }
      }),
      (caught: unknown) => {
        const caughtDetails = readAdminIngestRequestError(caught);

        return caught instanceof AdminIngestRequestError
          && caughtDetails?.status === 401
          && caughtDetails.errorCode === "ADMIN_INGEST_SELECTED_MODEL_UNAVAILABLE"
          && caughtDetails.causeCode === "DOUBAO_API_KEY_INVALID"
          && caughtDetails.retryable === false;
      },
      "A provider API-key failure must remain a model failure instead of becoming a login error."
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  const clientSource = readFileSync("lib/enterprise/ingest-client.ts", "utf8");
  const routeSource = readFileSync("app/api/admin/kb/ingest/gpt/route.ts", "utf8");
  const modeToggleSource = readFileSync("components/enterprise-admin/IngestModeToggle.tsx", "utf8");
  const shellSource = readFileSync("components/enterprise-admin/IngestChatGPTShell.tsx", "utf8");
  const presentationSource = readFileSync("lib/enterprise/admin-ingest-failure-presentation.ts", "utf8");

  assert.match(clientSource, /return new AdminIngestRequestError\(userMessage/);
  assert.match(clientSource, /payload\.errorCode === "ADMIN_INGEST_SELECTED_MODEL_UNAVAILABLE"/);
  assert.match(clientSource, /causeCode: payload\.causeCode/);
  assert.match(routeSource, /isRetryableDoubaoStrictModelFailure\(errorCode\)/);
  assert.match(modeToggleSource, /!isStrictSelectedModelFailure\(retryError\)/);
  assert.match(modeToggleSource, /status: "failed"/);
  assert.match(modeToggleSource, /failureMeta:/);
  assert.match(modeToggleSource, /setGptFallbackToast\(null\)/);
  assert.doesNotMatch(modeToggleSource, /toUserFriendlyMessage\(error\)/);
  assert.match(modeToggleSource, /reuseUserMessageId: previousUserMessage\.id/);
  assert.match(modeToggleSource, /excludeFailedIngestMessages/);
  assert.match(modeToggleSource, /preserveComposer: true/);
  assert.match(shellSource, /role="alert"/);
  assert.match(shellSource, /同模型重试/);
  assert.match(shellSource, /message\.failureMeta\?\.retryable === true/);
  assert.match(shellSource, /message\.failureMeta\?\.title/);
  assert.match(shellSource, /message\.status === "failed"/);
  assert.doesNotMatch(presentationSource, /系统正在自动优化/);

  console.log("Admin ingest Doubao timeout UI/error contract tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
