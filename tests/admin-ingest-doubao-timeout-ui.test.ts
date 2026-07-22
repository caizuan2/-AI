import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  AdminIngestRequestError,
  isStrictSelectedModelFailure,
  readAdminIngestRequestError
} from "@/lib/enterprise/admin-ingest-request-error";
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

  const retryMessages = [
    { id: "user-original", role: "user", status: "completed" },
    { id: "assistant-failed-original", role: "assistant", status: "failed" }
  ];
  assert.deepEqual(
    excludeFailedIngestMessages(retryMessages).map((message) => message.id),
    ["user-original"],
    "Failed UI messages must never enter the next model context."
  );
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

    return new Response(JSON.stringify({
      ok: false,
      success: false,
      errorCode: "ADMIN_INGEST_SELECTED_MODEL_UNAVAILABLE",
      causeCode: "DOUBAO_TIMEOUT",
      message: "豆包完整生成超时。",
      userMessage: "Doubao-Seed-2.1-pro 本轮响应超时，系统未切换其他模型。",
      retryable: true,
      provider: "doubao-pro",
      requestedProvider: "doubao-pro",
      actualProvider: null,
      selectedModelLabel: "Doubao-Seed-2.1-pro",
      requestedModel: "doubao-seed-2-1-pro-260628",
      actualModel: null,
      fallbackUsed: false,
      requestId: "request-send-core-timeout"
    }), { status: 504, headers: { "Content-Type": "application/json" } });
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
  } finally {
    globalThis.fetch = originalFetch;
  }

  const clientSource = readFileSync("lib/enterprise/ingest-client.ts", "utf8");
  const modeToggleSource = readFileSync("components/enterprise-admin/IngestModeToggle.tsx", "utf8");
  const shellSource = readFileSync("components/enterprise-admin/IngestChatGPTShell.tsx", "utf8");

  assert.match(clientSource, /throw new AdminIngestRequestError\(userMessage/);
  assert.match(clientSource, /causeCode: payload\.causeCode/);
  assert.match(modeToggleSource, /!isStrictSelectedModelFailure\(retryError\)/);
  assert.match(modeToggleSource, /status: "failed"/);
  assert.match(modeToggleSource, /Doubao-Seed-2\.1-pro 本轮响应超时/);
  assert.match(modeToggleSource, /reuseUserMessageId: previousUserMessage\.id/);
  assert.match(modeToggleSource, /excludeFailedIngestMessages/);
  assert.match(modeToggleSource, /preserveComposer: true/);
  assert.match(shellSource, /role="alert"/);
  assert.match(shellSource, /同模型重试/);
  assert.match(shellSource, /message\.status === "failed"/);

  console.log("Admin ingest Doubao timeout UI/error contract tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
