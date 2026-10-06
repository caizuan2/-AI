import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ADMIN_INGEST_DOUBAO_PRO_MODEL_ID,
  DOUBAO_PRO_MODEL_ID,
  getIngestModelOptionByLabel,
  getIngestModelOptionByProvider,
  resolveIngestActualModel,
  resolveIngestModelRuntime
} from "../lib/enterprise/ingest-model-options";
import {
  runAdminIngestWithSelectedModel,
  type AdminIngestModelInput
} from "../lib/enterprise/ingest-model-provider";
import { checkDoubaoIngestHealth } from "../lib/enterprise/doubao-health-check";
import { callDoubao } from "../lib/enterprise/doubao-ingest-client";
import { callLLM } from "../lib/enterprise/gpt-os-api-adapter";

const originalFetch = globalThis.fetch;
const originalEnv = {
  ARK_API_KEY: process.env.ARK_API_KEY,
  DOUBAO_BASE_URL: process.env.DOUBAO_BASE_URL,
  DOUBAO_PRO_MODEL: process.env.DOUBAO_PRO_MODEL
};
const originalReply = "\r\n# 豆包正文  \r\n\r\n保留原始正文、代码与末尾空格。  \r\n";
const input: AdminIngestModelInput = {
  input: "请整理当前知识并保留正文",
  source: "admin_ingest",
  platform: "web",
  syncTarget: ["web", "exe", "apk"],
  modelProvider: "doubao-pro",
  selectedModelLabel: "Doubao-Seed-2.1-pro",
  strictModelAffinity: true,
  preferredModel: DOUBAO_PRO_MODEL_ID
};

function mockDoubaoResponse(model: string, metadata: boolean) {
  const content = metadata ? JSON.stringify({
    knowledgeDraft: {
      title: "升级隔离测试",
      summary: "正文与模型身份保持绑定。",
      category: "测试",
      standardQuestion: "投喂端是否独立升级？",
      standardAnswer: originalReply,
      missingFields: []
    },
    saveRecommendation: "可以入库"
  }) : originalReply;
  return new Response([
    `data: ${JSON.stringify({
      id: "doubao-upgrade-scope-test",
      model,
      choices: [{ delta: { role: "assistant", content }, finish_reason: "stop" }]
    })}\n\n`,
    "data: [DONE]\n\n"
  ].join(""), {
    status: 200,
    headers: { "Content-Type": "text/event-stream; charset=utf-8" }
  });
}

async function testServerScope(scope: AdminIngestModelInput["modelScope"], preferredModel: string) {
  const expectedModel = scope === "admin-ingest"
    ? ADMIN_INGEST_DOUBAO_PRO_MODEL_ID
    : DOUBAO_PRO_MODEL_ID;
  const bodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://ark-scope.example.test/api/v3/chat/completions");
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    bodies.push(body);
    const messages = body.messages as Array<{ content: string }>;
    return mockDoubaoResponse(expectedModel, messages[0].content.includes("后台知识元数据整理器"));
  };
  const result = await runAdminIngestWithSelectedModel({ ...input, modelScope: scope, preferredModel });
  assert.equal(result.requestedModel, expectedModel);
  assert.equal(result.actualModel, expectedModel);
  assert.equal(result.gptProof.actualModel, expectedModel);
  assert.equal(result.replyMarkdown, originalReply);
  assert.equal(result.fallbackUsed, false);
  assert.equal(bodies.length, 2, "Visible content and metadata must keep their existing two-phase flow.");
  assert.ok(bodies.every((body) => body.model === expectedModel));
  assert.ok(bodies.every((body) => !("modelScope" in body)), "The server scope must not leak into provider JSON.");
}

async function testStrictIdentityFailure() {
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls += 1;
    assert.match(String(url), /ark-scope\.example\.test/);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    assert.equal(body.model, ADMIN_INGEST_DOUBAO_PRO_MODEL_ID);
    const messages = body.messages as Array<{ content: string }>;
    return mockDoubaoResponse(DOUBAO_PRO_MODEL_ID, messages[0].content.includes("后台知识元数据整理器"));
  };
  await assert.rejects(
    () => runAdminIngestWithSelectedModel({ ...input, modelScope: "admin-ingest" }),
    (error: unknown) => Boolean(error && typeof error === "object"
      && (error as { code?: unknown }).code === "ADMIN_INGEST_MODEL_AFFINITY_MISMATCH")
  );
  assert.ok(calls > 0 && calls <= 2, "A model mismatch must not fall back to another provider.");
}

async function testLowLevelModelIdentity() {
  let expectedModel = "";
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls += 1;
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    assert.equal(body.model, expectedModel);
    return new Response(JSON.stringify({ model: body.model, choices: [{ message: { content: "OK" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  for (const model of [DOUBAO_PRO_MODEL_ID, ADMIN_INGEST_DOUBAO_PRO_MODEL_ID]) {
    expectedModel = model;
    await callDoubao({ model });
    await callLLM("doubao-pro", { model });
    await callLLM("doubao", { model });
  }
  assert.equal(calls, 6);
}

async function main() {
  try {
    assert.equal(DOUBAO_PRO_MODEL_ID, "doubao-seed-2-1-pro-260628", "Frozen user model ID must not change.");
    assert.equal(ADMIN_INGEST_DOUBAO_PRO_MODEL_ID, "doubao-seed-2-1-pro-260915");
    assert.equal(getIngestModelOptionByProvider("doubao-pro").defaultModel, ADMIN_INGEST_DOUBAO_PRO_MODEL_ID);
    for (const legacy of [DOUBAO_PRO_MODEL_ID, "豆包 2.0 Pro", "doubao-seed-2-0-pro-260215", "Doubao-Seed-2.1-pro"]) {
      assert.equal(getIngestModelOptionByLabel(legacy).provider, "doubao-pro");
      assert.equal(resolveIngestModelRuntime({ preferredModel: legacy }).actualModel, ADMIN_INGEST_DOUBAO_PRO_MODEL_ID);
    }
    assert.equal(resolveIngestActualModel("deepseek-pro"), "deepseek-v4-pro");
    for (const provider of ["deepseek-pro", "deepseek-flash", "kimi", "qwen"] as const) {
      const runtime = resolveIngestModelRuntime({ provider });
      assert.equal(runtime.actualModel, resolveIngestActualModel(provider), `${provider} must not be upgraded with Doubao.`);
    }
    process.env.ARK_API_KEY = "test-key-never-sent-to-network";
    process.env.DOUBAO_BASE_URL = "https://ark-scope.example.test/api/v3";
    process.env.DOUBAO_PRO_MODEL = DOUBAO_PRO_MODEL_ID;
    await testServerScope("admin-ingest", DOUBAO_PRO_MODEL_ID);
    await testServerScope("admin-ingest", ADMIN_INGEST_DOUBAO_PRO_MODEL_ID);
    await testServerScope(undefined, DOUBAO_PRO_MODEL_ID);
    await testServerScope(undefined, ADMIN_INGEST_DOUBAO_PRO_MODEL_ID);
    const health = await checkDoubaoIngestHealth({ preferredModel: DOUBAO_PRO_MODEL_ID, testRequest: false });
    assert.equal(health.model, ADMIN_INGEST_DOUBAO_PRO_MODEL_ID);
    assert.equal(health.requestTested, false);
    await testStrictIdentityFailure();
    await testLowLevelModelIdentity();
    const route = readFileSync("app/api/admin/kb/ingest/gpt/route.ts", "utf8");
    assert.match(route, /runAdminIngestWithSelectedModel\(\{\s+modelScope: "admin-ingest"/);
    for (const userFile of ["user-agent-ingest-answer.ts", "career-mentor-ingest-answer.ts"]) {
      assert.doesNotMatch(readFileSync(`lib/ai-chat/${userFile}`, "utf8"), /modelScope/);
    }
    console.log("admin ingest Doubao upgrade / user isolation tests passed");
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

void main();
