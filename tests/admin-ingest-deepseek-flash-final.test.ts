import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { checkDeepSeekIngestHealth } from "../lib/enterprise/deepseek-health-check";
import { runDeepSeekAdminIngest } from "../lib/enterprise/deepseek-ingest-client";
import { getRecentLogEntries } from "../lib/logger";

const originalFetch = globalThis.fetch;
const originalEnv = {
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL,
  DEEPSEEK_FLASH_MODEL: process.env.DEEPSEEK_FLASH_MODEL,
};

function createSseResponse(model: string, rawBody: string) {
  const events = [
    `data: ${JSON.stringify({
      id: "flash-acceptance-response",
      model,
      created: 1_786_000_001,
      choices: [{ delta: { reasoning_content: "PRIVATE_FLASH_REASONING" } }]
    })}\n\n`,
    `data: ${JSON.stringify({
      id: "flash-acceptance-response",
      model,
      choices: [{ delta: { content: rawBody }, finish_reason: "stop" }]
    })}\n\n`,
    `data: ${JSON.stringify({
      id: "flash-acceptance-response",
      model,
      choices: [],
      usage: { prompt_tokens: 12, completion_tokens: 34, total_tokens: 46 }
    })}\n\n`,
    "data: [DONE]\n\n"
  ].join("");

  return new Response(events, {
    status: 200,
    headers: { "content-type": "text/event-stream; charset=utf-8" }
  });
}

async function main() {
  process.env.DEEPSEEK_API_KEY = "flash-acceptance-test-key";
  process.env.DEEPSEEK_BASE_URL = "https://deepseek-flash.example.test";
  process.env.DEEPSEEK_FLASH_MODEL = "deepseek-v4-flash";

  const exactReply = "# Flash 原始正文\n\n逐字一致。";
  const rawBody = JSON.stringify({
    replyMarkdown: exactReply,
    knowledgeDraft: { title: "内部字段不得外显" }
  });
  let requestedBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (_url, init) => {
    requestedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return createSseResponse("deepseek-v4-flash", rawBody);
  };

  const progress: string[] = [];
  const result = await runDeepSeekAdminIngest({
    input: "Flash 临时验收",
    source: "admin_ingest",
    platform: "web",
    syncTarget: ["web"],
    modelProvider: "deepseek-flash",
    preferredModel: "deepseek-v4-flash",
    selectedModelLabel: "DeepSeek-V4-Pro",
    strictModelAffinity: true,
    requestId: "deepseek-flash-acceptance-test",
    onProgressEvent(event) {
      if (event.type === "visible_delta") {
        progress.push(event.delta);
      }
    }
  });

  assert.equal(requestedBody?.model, "deepseek-v4-flash", "Explicit provider identity must win over a misleading label.");
  assert.equal(requestedBody?.temperature, 0.7);
  assert.equal(requestedBody?.max_tokens, 6000);
  assert.equal(requestedBody?.reasoning_effort, undefined);
  assert.equal(requestedBody?.thinking, undefined);
  assert.equal(requestedBody?.stream, true);
  assert.equal(result.requestedModel, "deepseek-v4-flash");
  assert.equal(result.actualModel, "deepseek-v4-flash");
  assert.equal(result.fallback, false);
  assert.equal(progress.join(""), exactReply);
  assert.equal(result.replyMarkdown, exactReply);
  assert.equal(JSON.stringify(progress).includes("PRIVATE_FLASH_REASONING"), false);

  const successLog = getRecentLogEntries({
    event: "enterprise_admin_ingest.deepseek_success",
    limit: 20
  }).find((entry) => entry.requestId === "deepseek-flash-acceptance-test");
  assert.equal(
    successLog?.replySha256,
    createHash("sha256").update(exactReply, "utf8").digest("hex")
  );
  assert.equal(Object.hasOwn(successLog ?? {}, "content"), false);
  assert.equal(Object.hasOwn(successLog ?? {}, "reasoning"), false);

  globalThis.fetch = async () => new Response(JSON.stringify({
    id: "flash-health-mismatch",
    model: "deepseek-v4-pro",
    choices: [{ message: { role: "assistant", content: "OK" } }]
  }), { status: 200, headers: { "content-type": "application/json" } });
  const mismatchHealth = await checkDeepSeekIngestHealth({
    provider: "deepseek-flash",
    preferredModel: "deepseek-v4-flash",
    selectedModelLabel: "DeepSeek-V4-Flash"
  });
  assert.equal(mismatchHealth.ok, false);
  assert.equal(mismatchHealth.errorCode, "DEEPSEEK_MODEL_AFFINITY_MISMATCH");
  assert.equal(mismatchHealth.requestedModel, "deepseek-v4-flash");
  assert.equal(mismatchHealth.actualModel, "deepseek-v4-pro");

  globalThis.fetch = async () => new Response(JSON.stringify({
    id: "flash-health-match",
    model: "deepseek-v4-flash",
    choices: [{ message: { role: "assistant", content: "OK" } }]
  }), { status: 200, headers: { "content-type": "application/json" } });
  const matchingHealth = await checkDeepSeekIngestHealth({
    provider: "deepseek-flash",
    preferredModel: "deepseek-v4-flash",
    selectedModelLabel: "DeepSeek-V4-Flash"
  });
  assert.equal(matchingHealth.ok, true);
  assert.equal(matchingHealth.requestedModel, matchingHealth.actualModel);

  const routeSource = readFileSync(path.join(process.cwd(), "app/api/admin/kb/ingest/gpt/route.ts"), "utf8");
  const parseRouteSource = readFileSync(path.join(process.cwd(), "app/api/admin/kb/ingest/files/parse/route.ts"), "utf8");
  const modeToggleSource = readFileSync(path.join(process.cwd(), "components/enterprise-admin/IngestModeToggle.tsx"), "utf8");
  const pickerSource = readFileSync(path.join(process.cwd(), "components/enterprise-admin/IngestGPTModelPicker.tsx"), "utf8");
  assert.doesNotMatch(routeSource, /isAdminIngestDeepSeekFlashAcceptanceEnabled/);
  assert.match(routeSource, /streamModelOption\.provider === "deepseek-pro" \|\| streamModelOption\.provider === "deepseek-flash"/);
  assert.doesNotMatch(parseRouteSource, /isAdminIngestDeepSeekFlashAcceptanceEnabled/);
  assert.match(parseRouteSource, /STRICT_WEB_INGEST_PROVIDERS[\s\S]*"deepseek-pro"[\s\S]*"deepseek-flash"[\s\S]*"doubao-pro"/);
  assert.match(parseRouteSource, /modelProvider === "deepseek-flash"[\s\S]*\? "tail_strict" as const/);
  assert.match(modeToggleSource, /health\.actualModel === health\.requestedModel/);
  assert.match(modeToggleSource, /pendingModelSelectionRef\.current = pendingSelection/);
  assert.match(modeToggleSource, /requestModelOption\.provider === "deepseek-pro" \|\| requestModelOption\.provider === "deepseek-flash"/);
  assert.doesNotMatch(modeToggleSource, /DeepSeek Flash 临时验收未启用，已停止本次请求/);
  assert.match(pickerSource, /if \(!input\.compact\) \{\s*return INGEST_MODEL_OPTIONS;/);
  assert.match(pickerSource, /PRIMARY_INGEST_MODEL_PROVIDERS = new Set\(\["deepseek-pro", "deepseek-flash", "doubao-pro"\]\)/);
  const sourceBundle = [routeSource, parseRouteSource, modeToggleSource, pickerSource, readFileSync(
    path.join(process.cwd(), "lib/enterprise/deepseek-ingest-client.ts"),
    "utf8"
  )].join("\n");
  assert.doesNotMatch(sourceBundle, /ADMIN_INGEST_(?:ACCEPTANCE|DEEPSEEK_(?:FLASH_AB|FLASH_VARIANT|ACCEPTANCE_AB|AB_VARIANT|CANDIDATE))/);
  assert.doesNotMatch(sourceBundle, /reasoning_effort/);
  assert.match(sourceBundle, /max_tokens: DEFAULT_ADMIN_INGEST_MAX_TOKENS/);

  console.log("admin ingest DeepSeek Flash final tests passed");
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
