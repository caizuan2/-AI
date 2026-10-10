import assert from "node:assert/strict";
import { runAdminIngestWithSelectedModel, type AdminIngestModelInput } from "../lib/enterprise/ingest-model-provider";
import { runUserAgentIngestAnswer } from "../lib/ai-chat/user-agent-ingest-answer";
import { runCareerMentorIngestAnswer } from "../lib/ai-chat/career-mentor-ingest-answer";
import { ADMIN_INGEST_DOUBAO_PRO_MODEL_ID, DOUBAO_PRO_MODEL_ID } from "../lib/enterprise/ingest-model-options";
import type { AdminIngestModelProgressEvent } from "../lib/enterprise/admin-ingest-model-progress";

const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;
const envNames = ["ARK_API_KEY", "DOUBAO_API_KEY", "DOUBAO_BASE_URL", "DOUBAO_PRO_MODEL", "DOUBAO_MODEL", "DOUBAO_HARD_TIMEOUT_MS", "DOUBAO_STREAM_IDLE_TIMEOUT_MS", "DOUBAO_FIRST_EVENT_TIMEOUT_MS", "DOUBAO_CONNECT_TIMEOUT_MS", "DEEPSEEK_API_KEY", "DEEPSEEK_BASE_URL", "DEEPSEEK_PRO_MODEL", "DEEPSEEK_FLASH_MODEL"];
const originalEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
const exactReply = "\n# 完整原文\n\n必须保留前缀、换行与尾部空格。  \n";
const metadata = JSON.stringify({ knowledgeDraft: { title: "测试", summary: "仅完整答案可整理。", category: "测试", tags: [], standardQuestion: "如何回答？", missingFields: [] }, saveRecommendation: "可以入库" });
const baseInput: AdminIngestModelInput = {
  input: "请根据当前固定知识回答", source: "admin_ingest", platform: "web", syncTarget: ["web"],
  strictModelAffinity: true, modelScope: "admin-ingest", replyOnly: true, deferMetadata: true
};

function sse(model: string, content: string, finishReason?: string, done = true, stall = false) {
  const data = `data: ${JSON.stringify({ id: "completion-boundary", model, choices: [{ delta: { content }, ...(finishReason ? { finish_reason: finishReason } : {}) }] })}\n\n${done ? "data: [DONE]\n\n" : ""}`;
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode(data)); if (!stall) controller.close(); },
    // A transport that cannot settle cancellation must not retain its scheduler slot.
    cancel() { return stall ? new Promise<void>(() => undefined) : undefined; }
  }), { headers: { "content-type": "text/event-stream" } });
}

async function checkFailure(provider: "deepseek-pro" | "doubao-pro", content: string, finishReason?: string, done = true, stall = false) {
  const events: AdminIngestModelProgressEvent[] = [];
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls += 1;
    const body = JSON.parse(String(init?.body)) as { model: string };
    return sse(body.model, content, finishReason, done, stall);
  };
  if (stall) {
    globalThis.setTimeout = ((handler: (...args: unknown[]) => void, timeout?: number, ...args: unknown[]) => (
      originalSetTimeout(handler, timeout === 55_000 ? 20 : timeout, ...args)
    )) as typeof setTimeout;
  }
  try {
    await assert.rejects(() => runAdminIngestWithSelectedModel({ ...baseInput, modelProvider: provider, onProgressEvent: (event) => events.push(event) }),
      (error: unknown) => {
        assert.ok(error && typeof error === "object");
        const failure = error as { code?: string; details?: { receivedContent?: boolean; receivedChars?: number } };
        assert.equal(failure.code, stall ? provider === "doubao-pro" ? "DOUBAO_TIMEOUT" : "DEEPSEEK_TIMEOUT" : provider === "doubao-pro" ? "DOUBAO_RESPONSE_PARSE_FAILED" : "DEEPSEEK_RESPONSE_PARSE_FAILED");
        assert.equal(failure.details?.receivedContent, true);
        assert.ok((failure.details?.receivedChars || 0) > 0);
        return true;
      });
    assert.equal(calls, 1, "A visible prefix must never trigger provider restart or fallback.");
    assert.ok(events.some((event) => event.type === "visible_delta"), "The prefix is kept in progress for failed UI preview.");
    assert.equal(events.some((event) => event.type === "visible_reply" || event.type === "metadata_status"), false, "Incomplete output cannot signal completed/savable body.");
  } finally { globalThis.setTimeout = originalSetTimeout; }
}

async function checkAdminJson() {
  for (const provider of ["deepseek-pro", "doubao-pro"] as const) {
    for (const finishReason of ["length", undefined, "stop"]) {
      const events: AdminIngestModelProgressEvent[] = [];
      globalThis.fetch = async (_url, init) => {
        const { model } = JSON.parse(String(init?.body)) as { model: string };
        return Response.json({ id: "json-boundary", model, choices: [{ message: { content: exactReply }, ...(finishReason ? { finish_reason: finishReason } : {}) }] });
      };
      const request = () => runAdminIngestWithSelectedModel({ ...baseInput, modelProvider: provider, onProgressEvent: (event) => events.push(event) });
      if (finishReason === "stop") {
        const result = await request();
        assert.equal(result.replyMarkdown, exactReply);
        assert.equal(events.filter((event) => event.type === "visible_reply").length, 1);
      } else {
        await assert.rejects(request, (error: unknown) => Boolean(error && typeof error === "object" && (error as { code?: string }).code?.endsWith("RESPONSE_PARSE_FAILED")));
        assert.equal(events.some((event) => event.type === "visible_reply"), false);
      }
    }
  }
}

async function checkFrozenEntries() {
  const shared = { originalQuestion: "如何下一步沟通？", contexts: [], recentConversation: [], agentId: "boundary-agent", userId: "boundary-user", requestId: "boundary-user" };
  for (const provider of ["deepseek-pro", "doubao-pro"] as const) {
    for (const career of [false, true]) {
      const delays: number[] = [];
      const requests: Record<string, unknown>[] = [];
      globalThis.setTimeout = ((handler: (...args: unknown[]) => void, timeout?: number, ...args: unknown[]) => {
        delays.push(timeout || 0);
        return originalSetTimeout(handler, timeout, ...args);
      }) as typeof setTimeout;
      globalThis.fetch = async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        requests.push(body);
        const messages = body.messages as Array<{ content: string }>;
        if (provider === "deepseek-pro") {
          // Frozen non-stream user protocol accepts its existing provider JSON shape.
          return Response.json({ id: "user-deepseek", model: body.model, choices: [{ message: { content: JSON.stringify({ replyMarkdown: exactReply, knowledgeDraft: JSON.parse(metadata).knowledgeDraft }) } }] });
        }
        return sse(String(body.model), messages[0].content.includes("后台知识元数据整理器") ? metadata : exactReply, "stop");
      };
      try {
        const result = career
          ? await runCareerMentorIngestAnswer({ ...shared, modelProvider: provider, scenarioQuestion: shared.originalQuestion, careerMentorStage: "ice_breaking" })
          : await runUserAgentIngestAnswer({ ...shared, modelProvider: provider, agentName: "测试专家", agentCategory: "测试", agentDescription: "固定知识" });
        assert.equal(result.answer, exactReply);
        assert.equal(result.fallbackUsed, false);
        const visible = requests[0];
        const prompt = JSON.stringify(visible.messages);
        assert.doesNotMatch(prompt, /请在 60 秒内给出可执行的完整答案/);
        assert.equal(visible.model, provider === "doubao-pro" ? DOUBAO_PRO_MODEL_ID : "deepseek-v4-pro");
        assert.equal("modelScope" in visible, false);
        if (provider === "deepseek-pro") {
          assert.equal(visible.max_tokens, 6_000);
          assert.match(prompt, /你必须返回一个 JSON 对象/);
          assert.ok(delays.includes(150_000));
          assert.equal(delays.includes(55_000), false);
        } else {
          assert.deepEqual(visible.thinking, { type: "enabled" });
          assert.equal(visible.reasoning_effort, "low");
          assert.equal(visible.max_completion_tokens, 6_000);
          assert.equal(visible.max_tokens, undefined);
          assert.match(prompt, /完成深度思考/);
          assert.ok(delays.includes(270_000));
          assert.equal(delays.includes(55_000), false);
          assert.equal(requests.length, 2, "Frozen user metadata remains synchronous.");
        }
      } finally { globalThis.setTimeout = originalSetTimeout; }
    }
  }
}

async function checkIncompleteMetadata() {
  for (const finishReason of ["length", undefined]) {
    const events: AdminIngestModelProgressEvent[] = [];
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { model: string; messages: Array<{ content: string }> };
      return body.messages[0].content.includes("后台知识元数据整理器")
        ? Response.json({ id: "metadata-boundary", model: body.model, choices: [{ message: { content: metadata }, ...(finishReason ? { finish_reason: finishReason } : {}) }] })
        : sse(body.model, exactReply, "stop");
    };
    const result = await runAdminIngestWithSelectedModel({ ...baseInput, modelProvider: "doubao-pro", replyOnly: false, deferMetadata: false, onProgressEvent: (event) => events.push(event) });
    assert.equal(result.replyMarkdown, exactReply, "A completed body survives an incomplete metadata phase.");
    assert.notEqual(result.saveRecommendation, "可以入库");
    assert.equal(result.structured.saveSuggestion, false);
    assert.ok(events.some((event) => event.type === "metadata_status" && event.state === "deferred"));
    assert.equal(events.some((event) => event.type === "metadata_status" && event.state === "completed"), false);
  }
}

async function main() {
  process.env.DEEPSEEK_API_KEY = "mock-key";
  process.env.DEEPSEEK_BASE_URL = "https://boundary.deepseek.test/v1";
  process.env.DEEPSEEK_PRO_MODEL = "deepseek-v4-pro";
  process.env.ARK_API_KEY = "mock-key";
  process.env.DOUBAO_BASE_URL = "https://boundary.doubao.test/api/v3";
  for (const name of envNames.filter((name) => name.includes("TIMEOUT") || name === "DOUBAO_PRO_MODEL" || name === "DOUBAO_MODEL")) delete process.env[name];
  await checkFrozenEntries();
  for (const provider of ["deepseek-pro", "doubao-pro"] as const) {
    await checkFailure(provider, exactReply, "length");
    await checkFailure(provider, exactReply, undefined, false);
    await checkFailure(provider, exactReply, "stop", false);
    await checkFailure(provider, exactReply, undefined, false, true);
  }
  for (const body of ['{"replyMarkdown":"未闭合', '{"replyMarkdown":"已闭合正文","knowledgeDraft":{']) {
    await checkFailure("deepseek-pro", body, "stop");
    await checkFailure("deepseek-pro", body, "length");
    await checkFailure("deepseek-pro", body, undefined, false);
    await checkFailure("deepseek-pro", body, undefined, false, true);
  }
  const closedStructuredBody = JSON.stringify({ replyMarkdown: exactReply });
  await checkFailure("deepseek-pro", closedStructuredBody, "length");
  await checkFailure("deepseek-pro", closedStructuredBody, "stop", false);
  await checkFailure("deepseek-pro", closedStructuredBody, undefined, false, true);
  await checkAdminJson();
  await checkIncompleteMetadata();
  for (const provider of ["deepseek-pro", "doubao-pro"] as const) {
    const events: AdminIngestModelProgressEvent[] = [];
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(body.max_tokens, 1_600);
      assert.equal(body.thinking, undefined);
      assert.match(JSON.stringify(body.messages), /请在 60 秒内给出可执行的完整答案/);
      assert.equal(body.model, provider === "doubao-pro" ? ADMIN_INGEST_DOUBAO_PRO_MODEL_ID : "deepseek-v4-pro");
      return sse(String(body.model), exactReply, "stop");
    };
    const result = await runAdminIngestWithSelectedModel({ ...baseInput, modelProvider: provider, onProgressEvent: (event) => events.push(event) });
    assert.equal(result.replyMarkdown, exactReply);
    assert.equal(events.filter((event) => event.type === "visible_reply").length, 1);
    assert.equal(result.fallbackUsed, false);
  }
  console.log("Admin ingest completion / frozen user entry boundary tests passed.");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
  for (const [name, value] of Object.entries(originalEnv)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
});
