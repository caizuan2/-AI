import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  createAdminIngestReplyProjector,
  extractCompleteAdminIngestReplyMarkdown,
  extractStreamingReplyMarkdown,
  looksLikeAdminIngestStructuredReply,
  type AdminIngestModelProgressEvent
} from "../lib/enterprise/admin-ingest-model-progress";
import { runDeepSeekAdminIngest } from "../lib/enterprise/deepseek-ingest-client";
import { runAdminIngestWithSelectedModel } from "../lib/enterprise/ingest-model-provider";

const originalFetch = globalThis.fetch;
const originalEnv = {
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL,
  DEEPSEEK_PRO_MODEL: process.env.DEEPSEEK_PRO_MODEL
};

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function createDeepSeekSseResponse(input: {
  model: string;
  responseId: string;
  rawStructuredBody: string;
  reasoningContent: string;
}) {
  const contentChunks = Array.from({ length: Math.ceil(input.rawStructuredBody.length / 17) }, (_, index) => (
    input.rawStructuredBody.slice(index * 17, (index + 1) * 17)
  ));
  const events = [
    `data: ${JSON.stringify({
      id: input.responseId,
      model: input.model,
      created: 1_786_000_001,
      choices: [{ delta: { role: "assistant", reasoning_content: input.reasoningContent } }]
    })}\n\n`,
    ...contentChunks.map((content, index) => `data: ${JSON.stringify({
      id: input.responseId,
      model: input.model,
      choices: [{
        delta: { content },
        ...(index === contentChunks.length - 1 ? { finish_reason: "stop" } : {})
      }]
    })}\n\n`),
    `data: ${JSON.stringify({
      id: input.responseId,
      model: input.model,
      choices: [],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 200,
        total_tokens: 300,
        prompt_cache_hit_tokens: 80,
        prompt_cache_miss_tokens: 20
      }
    })}\n\n`,
    "data: [DONE]\n\n"
  ].join("");
  const bytes = new TextEncoder().encode(events);
  const chunkSizes = [1, 2, 3, 5, 8, 13, 4, 7];

  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      let offset = 0;
      let chunkIndex = 0;

      while (offset < bytes.length) {
        const size = chunkSizes[chunkIndex % chunkSizes.length];
        controller.enqueue(bytes.slice(offset, Math.min(bytes.length, offset + size)));
        offset += size;
        chunkIndex += 1;
      }

      controller.close();
    }
  }), {
    status: 200,
    headers: { "content-type": "text/event-stream; charset=utf-8" }
  });
}

async function main() {
  {
    const projector = createAdminIngestReplyProjector();

    assert.equal(
      projector.push('{"knowledgeDraft":{"replyMarkdown":"内部字段"},"replyMark')?.replyMarkdown,
      undefined,
      "A nested same-named field must never be projected."
    );
    assert.equal(projector.push('down":"# 原文\\n表情：\\uD83D')?.replyMarkdown, "# 原文\n表情：");
    assert.equal(projector.push('\\uDE0A，引用：\\"保持原样\\""')?.delta, '😊，引用："保持原样"');
    assert.equal(projector.push(',"knowledgeDraft":{"title":"内部标题"}}')?.replyMarkdown, undefined);
    assert.equal(projector.current(), '# 原文\n表情：😊，引用："保持原样"');
    assert.equal(
      extractStreamingReplyMarkdown('{"knowledgeDraft":{"replyMarkdown":"内部"}}'),
      "",
      "Only the top-level replyMarkdown property is visible."
    );
  }

  process.env.DEEPSEEK_API_KEY = "deepseek-stream-test-secret";
  process.env.DEEPSEEK_BASE_URL = "https://deepseek-stream.example.test";
  process.env.DEEPSEEK_PRO_MODEL = "deepseek-v4-pro";

  const exactReplyMarkdown = '\n# DeepSeek 原始正文\n\n这是逐字保留的正文 😊。  \n\n```text\nRAW_BODY_SENTINEL\n```\n';
  const rawStructuredBody = JSON.stringify({
    replyMarkdown: exactReplyMarkdown,
    knowledgeDraft: {
      title: "内部知识草稿",
      summary: "不得出现在可见正文。",
      category: "测试",
      tags: ["DeepSeek", "原文"],
      importance: "high",
      standardQuestion: "是否保留原文？",
      standardAnswer: "保留。",
      keyPoints: ["原文一致"],
      actionItems: ["不要改写"],
      missingFields: []
    },
    suggestedQuestions: ["是否逐字一致？"],
    diagnostics: ["internal-diagnostic-sentinel"]
  });
  const progressEvents: AdminIngestModelProgressEvent[] = [];
  let fetchCount = 0;

  globalThis.fetch = async (_url, init) => {
    fetchCount += 1;
    const requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;

    assert.equal(requestBody.model, "deepseek-v4-pro");
    assert.equal(requestBody.temperature, 0.7, "Streaming must not change temperature.");
    assert.equal(requestBody.max_tokens, 6000, "Streaming must not change the output token budget.");
    assert.equal(requestBody.reasoning_effort, undefined, "Control must preserve the provider default reasoning effort.");
    assert.equal(requestBody.stream, true);

    return createDeepSeekSseResponse({
      model: "deepseek-v4-pro",
      responseId: "deepseek-original-stream-test",
      rawStructuredBody,
      reasoningContent: "PRIVATE_REASONING_MUST_NOT_BE_VISIBLE"
    });
  };

  const result = await runAdminIngestWithSelectedModel({
    input: "请根据固定知识给出完整原文正文",
    source: "admin_ingest",
    platform: "web",
    syncTarget: ["web", "apk", "exe"],
    modelProvider: "deepseek-pro",
    preferredModel: "deepseek-v4-pro",
    selectedModelLabel: "DeepSeek-V4-Pro",
    strictModelAffinity: true,
    requestId: "deepseek-original-stream-test",
    onProgressEvent: (event) => progressEvents.push(event)
  });

  const visibleDeltas = progressEvents.filter((event) => event.type === "visible_delta");
  const visibleReplies = progressEvents.filter((event) => event.type === "visible_reply");
  const reasoningEvents = progressEvents.filter((event) => event.type === "reasoning_activity");
  const visibleBody = visibleDeltas.map((event) => event.type === "visible_delta" ? event.delta : "").join("");

  assert.equal(fetchCount, 1, "Strict original streaming must not trigger a quality rewrite request.");
  assert.equal(result.gptProof.deepenAttempts, 0);
  assert.equal(visibleReplies.length, 1, "DeepSeek must emit exactly one answer-complete visible_reply event.");
  assert.equal(visibleBody, exactReplyMarkdown);
  assert.equal(visibleReplies[0]?.type === "visible_reply" ? visibleReplies[0].replyMarkdown : "", exactReplyMarkdown);
  assert.equal(result.replyMarkdown, exactReplyMarkdown);
  assert.equal(reasoningEvents.length, 0, "DeepSeek reasoning activity stays server-side and must not trigger Doubao-specific UI copy.");
  assert.equal(sha256(visibleBody), sha256(result.replyMarkdown), "Stream, terminal event, and final result must be byte-identical UTF-8 text.");
  assert.equal(visibleBody.includes("PRIVATE_REASONING_MUST_NOT_BE_VISIBLE"), false);
  assert.equal(visibleBody.includes("knowledgeDraft"), false);
  assert.equal(visibleBody.includes("内部知识草稿"), false);
  assert.equal(
    JSON.stringify(progressEvents).includes("PRIVATE_REASONING_MUST_NOT_BE_VISIBLE"),
    false,
    "DeepSeek reasoning must not be emitted through the progress contract."
  );
  assert.equal(result.diagnostics.some((item) => item.startsWith("deepseek:firstContentLatencyMs:")), true);
  assert.equal(result.diagnostics.some((item) => item.startsWith("deepseek:firstVisibleLatencyMs:")), true);
  assert.equal(result.diagnostics.some((item) => item.startsWith("deepseek:projectionDelayMs:")), true);
  assert.equal(result.diagnostics.includes("deepseek:promptCacheHitTokens:80"), true);
  assert.equal(result.diagnostics.includes("deepseek:promptCacheMissTokens:20"), true);
  assert.equal(result.diagnostics.some((item) => item.includes("PRIVATE_REASONING_MUST_NOT_BE_VISIBLE")), false);

  const fencedReplyMarkdown = "# 围栏正文\n\n```text\nINNER_FENCE_MUST_SURVIVE\n```";
  const fencedStructuredBody = `\`\`\`json\n${JSON.stringify({
    replyMarkdown: fencedReplyMarkdown,
    knowledgeDraft: { title: "内部字段" }
  })}\n\`\`\``;
  assert.equal(
    extractCompleteAdminIngestReplyMarkdown(fencedStructuredBody),
    fencedReplyMarkdown,
    "An outer JSON fence and an inner Markdown fence must not truncate final reply extraction."
  );
  assert.equal(
    extractCompleteAdminIngestReplyMarkdown('{"knowledgeDraft":{"replyMarkdown":"内部字段"}}'),
    "",
    "A complete nested same-named field must never be accepted as the final reply."
  );
  assert.equal(
    extractCompleteAdminIngestReplyMarkdown('{"replyMarkdown":"未完成的结构"'),
    "",
    "A truncated structured response must never be committed as complete."
  );
  assert.equal(looksLikeAdminIngestStructuredReply('{"replyMark'), true);
  assert.equal(looksLikeAdminIngestStructuredReply("# 明确的纯 Markdown 正文"), false);

  const fencedProgressEvents: AdminIngestModelProgressEvent[] = [];
  globalThis.fetch = async () => createDeepSeekSseResponse({
    model: "deepseek-v4-pro",
    responseId: "deepseek-fenced-original-test",
    rawStructuredBody: fencedStructuredBody,
    reasoningContent: "PRIVATE_REASONING_MUST_NOT_BE_VISIBLE"
  });
  const fencedResult = await runDeepSeekAdminIngest({
    input: "围栏结构也必须保留原文",
    source: "admin_ingest",
    platform: "web",
    syncTarget: ["web"],
    preferredModel: "deepseek-v4-pro",
    selectedModelLabel: "DeepSeek-V4-Pro",
    strictModelAffinity: true,
    requestId: "deepseek-fenced-original-test",
    onProgressEvent: (event) => fencedProgressEvents.push(event)
  });
  assert.equal(fencedResult.replyMarkdown, fencedReplyMarkdown);
  assert.equal(
    fencedProgressEvents.filter((event) => event.type === "visible_delta")
      .map((event) => event.type === "visible_delta" ? event.delta : "")
      .join(""),
    fencedReplyMarkdown
  );

  const multilinePayload = JSON.stringify({
    id: "deepseek-multiline-sse-test",
    model: "deepseek-v4-pro",
    choices: [{ delta: { content: rawStructuredBody }, finish_reason: "stop" }]
  }, null, 2);
  globalThis.fetch = async () => new Response([
    multilinePayload.split("\n").map((line) => `data: ${line}`).join("\n"),
    "data: [DONE]"
  ].join("\n\n") + "\n\n", {
    status: 200,
    headers: { "content-type": "text/event-stream" }
  });
  const multilineResult = await runDeepSeekAdminIngest({
    input: "兼容符合 SSE 规范的多 data 行事件",
    source: "admin_ingest",
    platform: "web",
    syncTarget: ["web"],
    preferredModel: "deepseek-v4-pro",
    selectedModelLabel: "DeepSeek-V4-Pro",
    strictModelAffinity: true,
    requestId: "deepseek-multiline-sse-test",
    onProgressEvent: () => undefined
  });
  assert.equal(
    multilineResult.replyMarkdown,
    exactReplyMarkdown,
    "One SSE event split across multiple data fields must be reconstructed before JSON parsing."
  );

  const providerSource = readFileSync("lib/enterprise/ingest-model-provider.ts", "utf8");
  const deepSeekSource = readFileSync("lib/enterprise/deepseek-ingest-client.ts", "utf8");

  assert.match(providerSource, /runDeepSeekAdminIngest\(\{[\s\S]*?\.\.\.payload,\s*modelProvider: provider,\s*signal: providerSignal,\s*onProgressEvent: deepSeekProgressEvent/);
  assert.match(providerSource, /onProgressEvent: doubaoProgressEvent,\s*deferMetadata: deferDoubaoMetadata/);
  assert.match(deepSeekSource, /const progressEvent = preserveRawReply \? input\.onProgressEvent : undefined/);
  assert.doesNotMatch(deepSeekSource, /rawText \+= reasoningDelta|contentDelta \+= reasoningDelta/);

  let malformedStreamCancelled = false;
  const malformedProgressEvents: AdminIngestModelProgressEvent[] = [];
  globalThis.fetch = async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode([
        `data: ${JSON.stringify({
          id: "deepseek-malformed-stream",
          model: "deepseek-v4-pro",
          choices: [{ delta: { content: '{"replyMarkdown":"尚未完成' } }]
        })}\n\n`,
        "data: {not-valid-json}\n\n"
      ].join("")));
    },
    cancel() {
      malformedStreamCancelled = true;
    }
  }), {
    status: 200,
    headers: { "content-type": "text/event-stream" }
  });

  await assert.rejects(
    runDeepSeekAdminIngest({
      input: "畸形流必须失败关闭",
      source: "admin_ingest",
      platform: "web",
      syncTarget: ["web"],
      preferredModel: "deepseek-v4-pro",
      selectedModelLabel: "DeepSeek-V4-Pro",
      strictModelAffinity: true,
      requestId: "deepseek-malformed-stream",
      onProgressEvent: (event) => malformedProgressEvents.push(event)
    }),
    (error: unknown) => Boolean(
      error
      && typeof error === "object"
      && (error as { code?: unknown }).code === "DEEPSEEK_RESPONSE_PARSE_FAILED"
    )
  );
  assert.equal(malformedStreamCancelled, true, "Malformed SSE must cancel the upstream reader immediately.");
  assert.equal(
    malformedProgressEvents.some((event) => event.type === "visible_reply"),
    false,
    "A malformed stream must never be marked complete or persisted as a final reply."
  );

  let truncatedLegalStreamCancelled = false;
  const truncatedLegalProgressEvents: AdminIngestModelProgressEvent[] = [];
  globalThis.fetch = async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode([
        `data: ${JSON.stringify({
          id: "deepseek-truncated-legal-stream",
          model: "deepseek-v4-pro",
          choices: [{ delta: { content: '{"replyMark' } }]
        })}\n\n`,
        "data: [DONE]\n\n"
      ].join("")));
    },
    cancel() {
      truncatedLegalStreamCancelled = true;
    }
  }), {
    status: 200,
    headers: { "content-type": "text/event-stream" }
  });

  let truncatedFailure: unknown;
  await assert.rejects(
    runDeepSeekAdminIngest({
      input: "合法 SSE 中的截断结构必须失败关闭",
      source: "admin_ingest",
      platform: "web",
      syncTarget: ["web"],
      preferredModel: "deepseek-v4-pro",
      selectedModelLabel: "DeepSeek-V4-Pro",
      strictModelAffinity: true,
      requestId: "deepseek-truncated-legal-stream",
      onProgressEvent: (event) => truncatedLegalProgressEvents.push(event)
    }),
    (error: unknown) => {
      truncatedFailure = error;
      return Boolean(
        error
        && typeof error === "object"
        && (error as { code?: unknown }).code === "DEEPSEEK_RESPONSE_PARSE_FAILED"
      );
    }
  );
  assert.equal(truncatedLegalStreamCancelled, true, "A legal SSE stream must be cancelled as soon as [DONE] is received.");
  assert.equal(
    truncatedLegalProgressEvents.some((event) => event.type === "visible_delta" || event.type === "visible_reply"),
    false,
    "A truncated structured response must not emit or commit a visible reply."
  );
  const truncatedDetails = (truncatedFailure as { details?: Record<string, unknown> } | undefined)?.details;
  assert.equal(truncatedDetails?.parseStage, "reply_json");
  assert.equal(truncatedDetails?.structuredCandidate, true);
  assert.equal(truncatedDetails?.structuredComplete, false);
  assert.equal(typeof truncatedDetails?.receivedChars, "number");
  assert.equal(typeof truncatedDetails?.projectedChars, "number");
  assert.equal(
    JSON.stringify(truncatedDetails).includes("replyMark"),
    false,
    "Failure diagnostics must contain counts and flags only, never provider content."
  );

  const abortSignalSeen: { current: AbortSignal | null } = { current: null };
  globalThis.fetch = async (_url, init) => {
    abortSignalSeen.current = init?.signal as AbortSignal;

    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        abortSignalSeen.current?.addEventListener("abort", () => {
          controller.error(new DOMException("The operation was aborted.", "AbortError"));
        }, { once: true });
      }
    }), {
      status: 200,
      headers: { "content-type": "text/event-stream" }
    });
  };
  const externalAbort = new AbortController();
  const abortedRequest = runDeepSeekAdminIngest({
    input: "停止测试",
    source: "admin_ingest",
    platform: "web",
    syncTarget: ["web"],
    preferredModel: "deepseek-v4-pro",
    selectedModelLabel: "DeepSeek-V4-Pro",
    strictModelAffinity: true,
    requestId: "deepseek-abort-test",
    signal: externalAbort.signal,
    onProgressEvent: () => undefined
  });

  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  externalAbort.abort(new DOMException("User stopped the request.", "AbortError"));
  await assert.rejects(abortedRequest, (error: unknown) => Boolean(
    error
    && typeof error === "object"
    && (error as { code?: unknown }).code === "DEEPSEEK_TIMEOUT"
  ));
  assert.equal(abortSignalSeen.current?.aborted, true, "The external stop signal must reach the DeepSeek provider request.");

  console.log("admin ingest DeepSeek original streaming tests passed");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  globalThis.fetch = originalFetch;

  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});
