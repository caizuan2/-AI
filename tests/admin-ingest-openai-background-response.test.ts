import assert from "node:assert/strict";

const originalFetch = globalThis.fetch;
const originalEnv = {
  AI_ENABLE_GPT_55: process.env.AI_ENABLE_GPT_55,
  NEXT_PUBLIC_AI_ENABLE_GPT_55: process.env.NEXT_PUBLIC_AI_ENABLE_GPT_55,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  OPENAI_MODEL: process.env.OPENAI_MODEL
};

async function main() {
  process.env.AI_ENABLE_GPT_55 = "true";
  process.env.NEXT_PUBLIC_AI_ENABLE_GPT_55 = "true";
  process.env.OPENAI_API_KEY = "gateway-test-token";
  process.env.OPENAI_BASE_URL = "https://gateway.example/v1";
  process.env.OPENAI_MODEL = "gpt-5.5";

  const { waitForOpenAIBackgroundResponse } = await import("../lib/enterprise/openai-ingest-client");
  const { runAdminIngestWithSelectedModel } = await import("../lib/enterprise/ingest-model-provider");
  const responseId = "resp_background_test_123456";
  let retrieveCount = 0;
  let cancelCount = 0;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);

    if (url.endsWith(`/${responseId}/cancel`)) {
      cancelCount += 1;
      return Response.json({
        id: responseId,
        status: "cancelled"
      });
    }

    assert.equal(init?.method, "GET");
    assert.equal(url, `https://gateway.example/v1/responses/${responseId}`);
    retrieveCount += 1;

    if (retrieveCount === 1) {
      return Response.json({
        id: responseId,
        status: "in_progress",
        model: "gpt-5.5-2026-04-23",
        output: []
      });
    }

    return Response.json({
      id: responseId,
      status: "completed",
      model: "gpt-5.5-2026-04-23",
      output: [{
        type: "message",
        content: [{
          type: "output_text",
          text: "后台正文完成"
        }]
      }]
    });
  }) as typeof fetch;

  const bodyText = await waitForOpenAIBackgroundResponse({
    initialBodyText: JSON.stringify({
      id: responseId,
      status: "queued",
      model: "gpt-5.5-2026-04-23",
      output: []
    }),
    responsesUrl: "https://gateway.example/v1/responses",
    apiKey: "gateway-test-token",
    signal: new AbortController().signal,
    timeoutMs: 2_000,
    pollIntervalMs: 1
  });
  const completed = JSON.parse(bodyText) as {
    id?: string;
    status?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  };

  assert.equal(retrieveCount, 2);
  assert.equal(completed.id, responseId);
  assert.equal(completed.status, "completed");
  assert.equal(completed.output?.[0]?.content?.[0]?.text, "后台正文完成");

  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    waitForOpenAIBackgroundResponse({
      initialBodyText: JSON.stringify({
        id: responseId,
        status: "in_progress"
      }),
      responsesUrl: "https://gateway.example/v1/responses",
      apiKey: "gateway-test-token",
      signal: controller.signal,
      timeoutMs: 2_000,
      pollIntervalMs: 1
    }),
    (error: unknown) => error instanceof Error && error.name === "AbortError"
  );
  assert.equal(cancelCount, 1);

  const routeAbortController = new AbortController();
  let routeCancelCount = 0;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);

    if (url.endsWith("/cancel")) {
      routeCancelCount += 1;
      return Response.json({
        id: responseId,
        status: "cancelled"
      });
    }

    assert.equal(init?.method, "POST");
    assert.equal(url, "https://gateway.example/v1/responses");
    setTimeout(() => routeAbortController.abort(), 1);

    return Response.json({
      id: responseId,
      status: "queued",
      model: "gpt-5.5-2026-04-23",
      output: []
    });
  }) as typeof fetch;

  await assert.rejects(
    runAdminIngestWithSelectedModel({
      input: "验证停止信号只取消当前 GPT 后台任务",
      source: "admin_ingest",
      platform: "web",
      syncTarget: ["web"],
      modelProvider: "openai",
      strictModelAffinity: true,
      signal: routeAbortController.signal
    }),
    (error: unknown) => Boolean(
      error
      && typeof error === "object"
      && (error as { code?: string }).code === "OPENAI_TIMEOUT"
    )
  );
  assert.equal(routeCancelCount, 1);

  console.log("Admin ingest OpenAI background response tests passed.");
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });
