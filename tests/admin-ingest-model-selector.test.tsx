import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  DEFAULT_INGEST_MODEL_OPTION,
  getIngestModelOptionByProvider
} from "@/lib/enterprise/ingest-model-options";
import {
  ADMIN_INGEST_MODEL_BY_AGENT_STORAGE_KEY,
  migrateLegacyAdminIngestModelPreference,
  parseAdminIngestModelPreferences,
  resolveAdminIngestAgentModel,
  setAdminIngestAgentModel
} from "@/lib/enterprise/ingest-model-preferences";
import { normalizeIngestSuccessPayload } from "@/lib/enterprise/ingest-response-normalizer";
import { sendCoreIngest } from "@/lib/enterprise/ingest-client";
import { shouldDisableDoubaoForHealth } from "@/lib/enterprise/ingest-model-availability";

function testAgentScopedModelPreferences() {
  const doubao = getIngestModelOptionByProvider("doubao-pro");
  let preferences = setAdminIngestAgentModel({
    preferences: {},
    agentId: "career-agent",
    modelLabel: doubao.label
  });

  preferences = setAdminIngestAgentModel({
    preferences,
    agentId: "health-agent",
    modelLabel: DEFAULT_INGEST_MODEL_OPTION.label
  });

  assert.equal(resolveAdminIngestAgentModel({
    preferences,
    agentId: "career-agent"
  }), doubao.label);
  assert.equal(resolveAdminIngestAgentModel({
    preferences,
    agentId: "health-agent"
  }), DEFAULT_INGEST_MODEL_OPTION.label);
  assert.equal(resolveAdminIngestAgentModel({
    preferences,
    agentId: "new-agent"
  }), DEFAULT_INGEST_MODEL_OPTION.label, "new Agents must keep DeepSeek Pro as the default");
  assert.match(ADMIN_INGEST_MODEL_BY_AGENT_STORAGE_KEY, /by-agent-v1$/);

  assert.deepEqual(parseAdminIngestModelPreferences("not-json"), {});
  assert.deepEqual(parseAdminIngestModelPreferences(JSON.stringify({
    "career-agent": doubao.label,
    "invalid-agent": "unknown-provider",
    "legacy-specialist-agent": "Kimi-K2.7-Code-HighSpeed"
  })), {
    "career-agent": doubao.label,
    "invalid-agent": DEFAULT_INGEST_MODEL_OPTION.label,
    "legacy-specialist-agent": "Kimi-K2.7-Code-HighSpeed"
  });

  const legacyExePreferences = setAdminIngestAgentModel({
    preferences: {},
    agentId: "legacy-exe-agent",
    modelLabel: "Qwen Plus"
  });
  assert.equal(legacyExePreferences["legacy-exe-agent"], "Qwen Plus", "the shared EXE picker must retain its existing model choices");

  const migrated = migrateLegacyAdminIngestModelPreference({
    preferences: {},
    activeAgentId: "active-agent",
    legacyModelLabel: doubao.label
  });
  assert.equal(migrated["active-agent"], doubao.label);
  assert.equal(migrated["another-agent"], undefined, "legacy selection must migrate only to the current Agent");
}

function testDoubaoHealthAvailabilityBoundary() {
  assert.equal(shouldDisableDoubaoForHealth({ ok: false, errorCode: "DOUBAO_API_KEY_MISSING" }), true);
  assert.equal(shouldDisableDoubaoForHealth({ ok: false, errorCode: "DOUBAO_API_KEY_INVALID" }), true);
  assert.equal(shouldDisableDoubaoForHealth({ ok: false, errorCode: "DOUBAO_MODEL_UNAVAILABLE" }), true);
  assert.equal(shouldDisableDoubaoForHealth({ ok: false, errorCode: "DOUBAO_TIMEOUT" }), false);
  assert.equal(shouldDisableDoubaoForHealth({ ok: false, errorCode: "DOUBAO_RATE_LIMITED" }), false);
  assert.equal(shouldDisableDoubaoForHealth({ ok: false, errorCode: "DOUBAO_REQUEST_FAILED" }), false);
}

function testPickerPlacementAndProviderIdentity() {
  const shellSource = readFileSync(path.join(
    process.cwd(),
    "components/enterprise-admin/IngestChatGPTShell.tsx"
  ), "utf8");
  const pickerSource = readFileSync(path.join(
    process.cwd(),
    "components/enterprise-admin/IngestGPTModelPicker.tsx"
  ), "utf8");
  const modeToggleSource = readFileSync(path.join(
    process.cwd(),
    "components/enterprise-admin/IngestModeToggle.tsx"
  ), "utf8");
  const healthRouteSource = readFileSync(path.join(
    process.cwd(),
    "app/api/admin/kb/ingest/models/health/route.ts"
  ), "utf8");
  const pickerPosition = shellSource.indexOf("<IngestGPTModelPicker", shellSource.indexOf("items-center justify-end"));
  const scissorsPosition = shellSource.indexOf("<Scissors", pickerPosition);

  assert.ok(pickerPosition > -1, "the Web composer must render the model selector");
  assert.ok(scissorsPosition > pickerPosition, "the model selector must appear immediately before the scissors tool");
  assert.doesNotMatch(shellSource, /<div className="hidden">\s*<IngestGPTModelPicker/);
  assert.match(shellSource.slice(pickerPosition, scissorsPosition), /compact/);
  assert.match(shellSource.slice(pickerPosition, scissorsPosition), /align="right"/);
  assert.match(pickerSource, /provider === "doubao-pro"/);
  assert.match(pickerSource, /badge: "豆"/);
  assert.match(pickerSource, /name: "豆包"/);
  assert.match(pickerSource, /name: "DeepSeek"/);
  assert.match(pickerSource, /暂未连接/);
  assert.match(pickerSource, /disabled=\{isUnavailable\}/);
  assert.match(pickerSource, /compact\s*\?\s*INGEST_MODEL_OPTIONS\.filter/);
  assert.match(pickerSource, /:\s*INGEST_MODEL_OPTIONS/);
  assert.match(pickerSource, /fixed inset-x-4 bottom-24/);
  assert.match(pickerSource, /max-h-\[calc\(100dvh-8rem\)\]/);
  assert.match(pickerSource, /overflow-y-auto/);
  assert.match(modeToggleSource, /const requestVersion = \+\+doubaoHealthRequestVersionRef\.current;\s+const targetAgentId = activeAgent\.id;\s+const nextModel/);
  assert.match(modeToggleSource, /activeAgentIdRef\.current !== targetAgentId/);
  assert.match(modeToggleSource, /doubaoHealthRequestVersionRef\.current \+= 1;\s+\}, \[activeAgent\.id\]\)/);
  assert.match(healthRouteSource, /await requireAdminIngestActor\(request/);
  assert.match(healthRouteSource, /targetType:\s*"admin_kb_ingest_model_health"/);
  assert.match(healthRouteSource, /return apiError\(error\)/);
}

function testFallbackMetadataAndRawBodyBoundary() {
  const rawMarkdown = "\n# 豆包原文\n\n> 引用\n\n- **完整列表**\n\n```text\n原始代码块\n```\n";
  const normalized = normalizeIngestSuccessPayload({
    ok: true,
    data: {
      provider: "doubao",
      requestedProvider: "doubao-pro",
      actualProvider: "doubao-pro",
      requestedModel: "doubao-seed-2-0-pro-260215",
      actualModel: "doubao-seed-2-0-pro-260215",
      fallbackUsed: false,
      modelDiagnostics: {
        fallbackChain: []
      },
      replyMarkdown: rawMarkdown
    }
  });

  assert.ok(normalized);
  assert.equal(normalized.replyText, rawMarkdown);
  assert.equal(normalized.requestedProvider, "doubao-pro");
  assert.equal(normalized.actualProvider, "doubao-pro");
  assert.equal(normalized.fallbackUsed, false);
  assert.deepEqual(normalized.modelDiagnostics, { fallbackChain: [] });
  assert.equal(normalized.raw.replyMarkdown, rawMarkdown, "the raw Doubao Markdown body must remain byte-for-byte intact");

  const fallback = normalizeIngestSuccessPayload({
    data: {
      provider: "deepseek",
      requestedProvider: "doubao-pro",
      actualProvider: "deepseek-pro",
      requestedModel: "doubao-seed-2-0-pro-260215",
      actualModel: "deepseek-v4-pro",
      fallbackUsed: true,
      modelDiagnostics: {
        fallbackChain: ["doubao-pro", "deepseek-pro"]
      },
      replyMarkdown: "# DeepSeek fallback"
    }
  });
  assert.ok(fallback);
  assert.equal(fallback.provider, "deepseek");
  assert.equal(fallback.requestedProvider, "doubao-pro");
  assert.equal(fallback.actualProvider, "deepseek-pro");
  assert.equal(fallback.requestedModel, "doubao-seed-2-0-pro-260215");
  assert.equal(fallback.actualModel, "deepseek-v4-pro");
  assert.equal(fallback.fallbackUsed, true);
  assert.deepEqual(fallback.modelDiagnostics, {
    fallbackChain: ["doubao-pro", "deepseek-pro"]
  });

  const clientSource = readFileSync(path.join(process.cwd(), "lib/enterprise/ingest-client.ts"), "utf8");
  const routeSource = readFileSync(path.join(process.cwd(), "app/api/admin/kb/ingest/gpt/route.ts"), "utf8");

  assert.match(clientSource, /preserveRawDoubaoOutput\s*\?\s*visibleReply\s*:\s*applyExpressionLayer/);
  assert.match(clientSource, /preserveRawOutput\s*\?\s*chunk\s*:\s*renderer\.formatStream\(chunk\)/);
  assert.match(clientSource, /draft\.replyMarkdown\s*=\s*styledReply/);
  assert.match(routeSource, /result\.provider === "doubao"/);
  assert.match(routeSource, /output:\s*rawReply/);
  assert.match(routeSource, /changed:\s*false/);
  assert.match(routeSource, /retryable:\s*isMissingKey \|\| isSafetyRejection \? false : fallback\.retryable/);
}

async function testFinalDoubaoCompletionKeepsRawMarkdown() {
  const originalFetch = globalThis.fetch;
  const rawMarkdown = "\n# 完成态豆包原文\n\n尾随两个空格必须保留。  \n\n```text\nRAW_COMPLETION_SENTINEL\n```\n";

  globalThis.fetch = async (input) => {
    if (String(input).includes("/api/admin/kb/ingest/models/health")) {
      return new Response(JSON.stringify({
        ok: true,
        configured: true,
        provider: "doubao-pro",
        baseUrlConfigured: true,
        modelConfigured: true,
        apiKeyConfigured: true,
        selectedModelLabel: "豆包 2.0 Pro",
        model: "doubao-seed-2-0-pro-260215",
        actualModel: "doubao-seed-2-0-pro-260215",
        mode: "highest",
        message: "豆包接口可用",
        diagnostics: [],
        requestTested: true
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      ok: true,
      data: {
        provider: "doubao",
        requestedProvider: "doubao-pro",
        actualProvider: "doubao-pro",
        model: "doubao-seed-2-0-pro-260215",
        modelDisplayName: "豆包 2.0 Pro",
        requestedModel: "doubao-seed-2-0-pro-260215",
        actualModel: "doubao-seed-2-0-pro-260215",
        modelMode: "highest",
        fallback: false,
        fallbackUsed: false,
        replyMarkdown: rawMarkdown,
        knowledgeDraft: {
          title: "原文透传测试",
          category: "测试",
          summary: "只验证完成态正文边界。",
          standardQuestion: "是否保留原文？",
          standardAnswer: "是。"
        },
        records: []
      }
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const result = await sendCoreIngest({
      text: "验证豆包完成态原文",
      category: "测试",
      model: "豆包 2.0 Pro",
      modelProvider: "doubao-pro",
      selectedModelLabel: "豆包 2.0 Pro",
      agent: {
        id: "doubao-raw-agent",
        name: "原文测试 Agent",
        role: "测试专家",
        description: "仅用于模型选择专项测试",
        avatar: "豆",
        tone: "amber",
        status: "active"
      }
    });

    assert.equal(result.visibleReply, rawMarkdown);
    assert.equal(result.replyMarkdown, rawMarkdown);
    assert.equal(result.draft.replyMarkdown, rawMarkdown);
    assert.equal(result.requestedProvider, "doubao-pro");
    assert.equal(result.actualProvider, "doubao-pro");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function main() {
  testAgentScopedModelPreferences();
  testDoubaoHealthAvailabilityBoundary();
  testPickerPlacementAndProviderIdentity();
  testFallbackMetadataAndRawBodyBoundary();
  await testFinalDoubaoCompletionKeepsRawMarkdown();

  console.log("admin ingest per-Agent DeepSeek/Doubao selector tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
