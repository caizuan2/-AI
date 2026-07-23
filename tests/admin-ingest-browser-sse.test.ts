import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  AdminIngestRequestError,
  readAdminIngestRequestError
} from "@/lib/enterprise/admin-ingest-request-error";
import { extractDoubaoReplyMarkdown } from "@/lib/enterprise/doubao-ingest-client";
import { sendCoreIngest } from "@/lib/enterprise/ingest-client";

const originalFetch = globalThis.fetch;
const rawMarkdown = "\n# 豆包原文\n\n保留开头、结尾和  Markdown  空格。  \n";

function buildSuccessPayload() {
  return {
    ok: true,
    provider: "doubao",
    requestedProvider: "doubao-pro",
    actualProvider: "doubao-pro",
    requestedModel: "doubao-seed-2-1-pro-260628",
    actualModel: "doubao-seed-2-1-pro-260628",
    model: "doubao-seed-2-1-pro-260628",
    modelDisplayName: "Doubao-Seed-2.1-pro",
    selectedModelLabel: "Doubao-Seed-2.1-pro",
    fallback: false,
    fallbackUsed: false,
    responseId: "doubao-browser-sse-success",
    replyMarkdown: rawMarkdown,
    content: rawMarkdown,
    answer: rawMarkdown,
    knowledgeDraft: {
      title: "豆包浏览器 SSE 验证",
      category: "测试",
      summary: "验证浏览器外层 SSE",
      tags: ["SSE"],
      standardAnswer: rawMarkdown,
      qaPairs: [],
      importance: "medium",
      saveStatus: "待确认"
    },
    records: [],
    diagnostics: ["doubao:metadataCompleted:true"]
  };
}

function createBrowserSseResponse(input: {
  requestId: string;
  eventName: "final" | "error";
  status: number;
  payload: unknown;
  includeVisibleReply?: boolean;
  statusEvents?: Array<Record<string, unknown>>;
}) {
  const [statusBeforeVisible, ...statusAfterVisible] = input.statusEvents ?? [];
  const body = [
    `event: accepted\ndata: ${JSON.stringify({ type: "accepted", requestId: input.requestId })}\n\n`,
    `event: heartbeat\ndata: ${JSON.stringify({ type: "heartbeat", requestId: input.requestId, elapsedMs: 12_000 })}\n\n`,
    ...(statusBeforeVisible ? [
      `event: status\ndata: ${JSON.stringify({ requestId: input.requestId, ...statusBeforeVisible })}\n\n`
    ] : []),
    ...(input.includeVisibleReply ? [
      `event: visible\ndata: ${JSON.stringify({
        type: "visible",
        requestId: input.requestId,
        provider: "doubao-pro",
        actualModel: "doubao-seed-2-1-pro-260628",
        responseId: "doubao-browser-sse-success",
        replyMarkdown: rawMarkdown,
        metadataPending: true
      })}\n\n`
    ] : []),
    ...statusAfterVisible.map((event) => (
      `event: status\ndata: ${JSON.stringify({ requestId: input.requestId, ...event })}\n\n`
    )),
    `event: ${input.eventName}\ndata: ${JSON.stringify({
      type: input.eventName,
      requestId: input.requestId,
      status: input.status,
      payload: input.payload
    })}\n\n`
  ].join("");
  const bytes = new TextEncoder().encode(body);

  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += 7) {
        controller.enqueue(bytes.slice(offset, Math.min(offset + 7, bytes.length)));
      }
      controller.close();
    }
  }), {
    status: 200,
    headers: { "Content-Type": "text/event-stream; charset=utf-8" }
  });
}

const agent = {
  id: "agent-browser-sse",
  name: "豆包 SSE 测试 Agent",
  role: "测试专家",
  description: "只验证浏览器传输",
  avatar: "豆",
  tone: "amber" as const,
  status: "active" as const
};

async function main() {
  const recoveredMarkdown = "# 已完整生成的正文\n\n原文保留。";
  const malformedMetadataTail = `{"replyMarkdown":${JSON.stringify(recoveredMarkdown)},"knowledgeDraft":{"title":"未闭合"`;

  assert.equal(
    extractDoubaoReplyMarkdown(malformedMetadataTail),
    recoveredMarkdown,
    "A closed replyMarkdown JSON string must survive a malformed metadata tail without body rewriting."
  );

  let mode: "sse_success" | "sse_error" | "sse_rate_limited" | "sse_inference_paused" | "sse_disconnect" | "legacy_json" = "sse_success";
  let gptRequestCount = 0;

  globalThis.fetch = async (request, init) => {
    if (String(request).includes("/api/admin/kb/ingest/models/health")) {
      return new Response(JSON.stringify({
        ok: true,
        configured: true,
        provider: "doubao-pro",
        selectedModelLabel: "Doubao-Seed-2.1-pro",
        model: "doubao-seed-2-1-pro-260628",
        actualModel: "doubao-seed-2-1-pro-260628",
        fallbackUsed: false,
        requestTested: true,
        mode: "highest",
        message: "Doubao-Seed-2.1-pro 接口可用"
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    gptRequestCount += 1;
    const requestBody = JSON.parse(String(init?.body ?? "{}")) as {
      runtimeContext?: { requestId?: string };
    };
    const requestId = requestBody.runtimeContext?.requestId ?? "browser-sse-contract";
    assert.match(
      new Headers(init?.headers).get("accept") ?? "",
      /text\/event-stream/,
      "Web Doubao requests must opt into the browser-facing SSE transport."
    );

    if (mode === "legacy_json") {
      return new Response(JSON.stringify(buildSuccessPayload()), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (mode === "sse_error") {
      return createBrowserSseResponse({
        requestId,
        eventName: "error",
        status: 503,
        payload: {
          ok: false,
          success: false,
          errorCode: "ADMIN_INGEST_SELECTED_MODEL_UNAVAILABLE",
          causeCode: "DOUBAO_RESPONSE_PARSE_FAILED",
          message: "Doubao-Seed-2.1-pro 返回未完整解析，系统未切换其他模型。",
          userMessage: "Doubao-Seed-2.1-pro 返回未完整解析，系统未切换其他模型。",
          retryable: true,
          provider: "doubao-pro",
          requestedProvider: "doubao-pro",
          actualProvider: null,
          selectedModelLabel: "Doubao-Seed-2.1-pro",
          requestedModel: "doubao-seed-2-1-pro-260628",
          actualModel: null,
          fallbackUsed: false,
          requestId,
          failureDetails: {
            parseStage: "finish_reason",
            finishReason: "length",
            eventCount: 34,
            receivedChars: 8192,
            receivedContent: true
          }
        }
      });
    }

    if (mode === "sse_rate_limited") {
      return createBrowserSseResponse({
        requestId,
        eventName: "error",
        status: 429,
        payload: {
          ok: false,
          success: false,
          errorCode: "ADMIN_INGEST_SELECTED_MODEL_UNAVAILABLE",
          causeCode: "DOUBAO_RATE_LIMITED",
          message: "Doubao-Seed-2.1-pro 请求繁忙，系统未切换其他模型。",
          userMessage: "Doubao-Seed-2.1-pro 请求繁忙，系统未切换其他模型。",
          retryable: true,
          provider: "doubao-pro",
          requestedProvider: "doubao-pro",
          actualProvider: null,
          selectedModelLabel: "Doubao-Seed-2.1-pro",
          requestedModel: "doubao-seed-2-1-pro-260628",
          actualModel: null,
          fallbackUsed: false,
          requestId,
          failureDetails: {
            parseStage: "http_status",
            retryAfterMs: 5_000
          }
        },
        statusEvents: [{
          type: "rate_limit_wait",
          phase: "visible",
          retryAfterMs: 5_000,
          attempt: 1
        }]
      });
    }

    if (mode === "sse_inference_paused") {
      return createBrowserSseResponse({
        requestId,
        eventName: "error",
        status: 429,
        payload: {
          ok: false,
          success: false,
          errorCode: "ADMIN_INGEST_SELECTED_MODEL_UNAVAILABLE",
          causeCode: "DOUBAO_INFERENCE_LIMIT_PAUSED",
          message: "Doubao-Seed-2.1-pro 推理限额已达到，模型服务已暂停。",
          userMessage: "Doubao-Seed-2.1-pro 推理限额已达到，模型服务已暂停。",
          retryable: false,
          provider: "doubao-pro",
          requestedProvider: "doubao-pro",
          actualProvider: null,
          selectedModelLabel: "Doubao-Seed-2.1-pro",
          requestedModel: "doubao-seed-2-1-pro-260628",
          actualModel: null,
          fallbackUsed: false,
          requestId
        }
      });
    }

    if (mode === "sse_disconnect") {
      const acceptedAndVisible = new TextEncoder().encode(
        [
          `event: accepted\ndata: ${JSON.stringify({ type: "accepted", requestId })}\n\n`,
          `event: visible\ndata: ${JSON.stringify({
            type: "visible",
            requestId,
            actualModel: "doubao-seed-2-1-pro-260628",
            responseId: "doubao-browser-sse-disconnect-visible",
            replyMarkdown: rawMarkdown,
            metadataPending: true
          })}\n\n`
        ].join("")
      );
      let acceptedSent = false;

      return new Response(new ReadableStream<Uint8Array>({
        pull(controller) {
          if (!acceptedSent) {
            acceptedSent = true;
            controller.enqueue(acceptedAndVisible);
            return;
          }

          controller.error(new TypeError("simulated connection reset after accepted"));
        }
      }), {
        status: 200,
        headers: { "Content-Type": "text/event-stream; charset=utf-8" }
      });
    }

    return createBrowserSseResponse({
      requestId,
      eventName: "final",
      status: 200,
      payload: buildSuccessPayload(),
      includeVisibleReply: true,
      statusEvents: [
        { type: "queue_wait", phase: "visible", queueDepth: 1 },
        { type: "metadata_status", phase: "metadata", state: "pending" },
        { type: "metadata_status", phase: "metadata", state: "completed" }
      ]
    });
  };

  try {
    const successEventOrder: string[] = [];
    let visibleReply = "";
    const success = await sendCoreIngest({
      text: "豆包浏览器 SSE 成功测试",
      category: "测试",
      model: "Doubao-Seed-2.1-pro",
      modelProvider: "doubao-pro",
      selectedModelLabel: "Doubao-Seed-2.1-pro",
      requestId: "browser-sse-success",
      agent,
      streaming: {
        onVisibleReply(event) {
          successEventOrder.push("visible");
          visibleReply = event.replyMarkdown;
          assert.equal(event.requestId, "browser-sse-success");
          assert.equal(event.metadataPending, true);
        },
        onStatus(event) {
          successEventOrder.push(`${event.type}:${event.state ?? event.phase ?? ""}`);
        }
      }
    });
    successEventOrder.push("final");
    assert.equal(visibleReply, rawMarkdown, "The early visible event must preserve the exact Doubao Markdown.");
    assert.deepEqual(successEventOrder, [
      "queue_wait:visible",
      "visible",
      "metadata_status:pending",
      "metadata_status:completed",
      "final"
    ]);
    assert.equal(success.replyMarkdown, rawMarkdown, "Doubao Markdown must remain byte-for-byte unchanged after SSE JSON decoding.");
    assert.equal(success.fallbackUsed, false);

    mode = "legacy_json";
    const legacy = await sendCoreIngest({
      text: "旧 JSON 兼容测试",
      category: "测试",
      model: "Doubao-Seed-2.1-pro",
      modelProvider: "doubao-pro",
      selectedModelLabel: "Doubao-Seed-2.1-pro",
      requestId: "browser-sse-legacy-json",
      agent
    });
    assert.equal(legacy.replyMarkdown, rawMarkdown, "A legacy JSON response must remain supported after opting into SSE.");

    mode = "sse_error";
    await assert.rejects(
      () => sendCoreIngest({
        text: "豆包浏览器 SSE 错误测试",
        category: "测试",
        model: "Doubao-Seed-2.1-pro",
        modelProvider: "doubao-pro",
        selectedModelLabel: "Doubao-Seed-2.1-pro",
        requestId: "browser-sse-error",
        agent
      }),
      (error: unknown) => {
        const details = readAdminIngestRequestError(error);

        return error instanceof AdminIngestRequestError
          && details?.status === 503
          && details.errorCode === "ADMIN_INGEST_SELECTED_MODEL_UNAVAILABLE"
          && details.causeCode === "DOUBAO_RESPONSE_PARSE_FAILED"
          && details.failureDetails?.parseStage === "finish_reason"
          && details.failureDetails.finishReason === "length"
          && details.fallbackUsed === false;
      }
    );

    mode = "sse_rate_limited";
    let rateLimitWaitMs = 0;
    await assert.rejects(
      () => sendCoreIngest({
        text: "豆包浏览器 SSE 限流测试",
        category: "测试",
        model: "Doubao-Seed-2.1-pro",
        modelProvider: "doubao-pro",
        selectedModelLabel: "Doubao-Seed-2.1-pro",
        requestId: "browser-sse-rate-limited",
        agent,
        streaming: {
          onStatus(event) {
            if (event.type === "rate_limit_wait") {
              rateLimitWaitMs = event.retryAfterMs ?? 0;
            }
          }
        }
      }),
      (error: unknown) => {
        const details = readAdminIngestRequestError(error);

        return error instanceof AdminIngestRequestError
          && details?.status === 429
          && details.causeCode === "DOUBAO_RATE_LIMITED"
          && details.failureDetails?.retryAfterMs === 5_000
          && details.retryable === true
          && details.fallbackUsed === false;
      }
    );
    assert.equal(rateLimitWaitMs, 5_000, "Retry-After must survive the browser SSE status channel.");

    mode = "sse_inference_paused";
    const pausedRequestCountBefore = gptRequestCount;
    await assert.rejects(
      () => sendCoreIngest({
        text: "豆包浏览器 SSE 推理限额暂停测试",
        category: "测试",
        model: "Doubao-Seed-2.1-pro",
        modelProvider: "doubao-pro",
        selectedModelLabel: "Doubao-Seed-2.1-pro",
        requestId: "browser-sse-inference-paused",
        agent
      }),
      (error: unknown) => {
        const details = readAdminIngestRequestError(error);

        return error instanceof AdminIngestRequestError
          && details?.status === 429
          && details.causeCode === "DOUBAO_INFERENCE_LIMIT_PAUSED"
          && details.retryable === false
          && details.fallbackUsed === false;
      }
    );
    assert.equal(gptRequestCount - pausedRequestCountBefore, 1, "A paused browser request must not retry or switch providers.");

    mode = "sse_disconnect";
    let disconnectedVisibleReply = "";
    await assert.rejects(
      () => sendCoreIngest({
        text: "豆包浏览器 SSE 断流测试",
        category: "测试",
        model: "Doubao-Seed-2.1-pro",
        modelProvider: "doubao-pro",
        selectedModelLabel: "Doubao-Seed-2.1-pro",
        requestId: "browser-sse-disconnect",
        agent,
        streaming: {
          onVisibleReply(event) {
            disconnectedVisibleReply = event.replyMarkdown;
          }
        }
      }),
      (error: unknown) => {
        const details = readAdminIngestRequestError(error);

        return error instanceof AdminIngestRequestError
          && details?.errorCode === "ADMIN_INGEST_SELECTED_MODEL_UNAVAILABLE"
          && details.causeCode === "DOUBAO_REQUEST_FAILED"
          && details.retryable === true
          && details.failureDetails?.parseStage === "browser_sse_network"
          && details.fallbackUsed === false;
      }
    );
    assert.equal(
      disconnectedVisibleReply,
      rawMarkdown,
      "A transport failure after the visible event must not erase the already delivered Doubao body."
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(gptRequestCount, 6);

  const routeSource = readFileSync("app/api/admin/kb/ingest/gpt/route.ts", "utf8");
  const providerSource = readFileSync("lib/enterprise/ingest-model-provider.ts", "utf8");
  assert.match(routeSource, /ADMIN_INGEST_SSE_HEARTBEAT_MS = 12_000/);
  assert.match(routeSource, /enqueue\("accepted"/);
  assert.match(routeSource, /enqueue\("heartbeat"/);
  assert.match(routeSource, /enqueue\("visible"/);
  assert.match(routeSource, /enqueue\("status"/);
  assert.match(routeSource, /response\.ok \? "final" : "error"/);
  assert.match(routeSource, /producer: executeRequest/);
  assert.match(routeSource, /onProgressEvent: onDoubaoProgressEvent/);
  assert.match(providerSource, /signal: providerSignal/);

  console.log("Admin ingest browser SSE transport tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
