import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  DEFAULT_INGEST_MODEL_OPTION,
  DOUBAO_PRO_MODEL_ID,
  getIngestModelOptionByLabel,
  getIngestModelOptionByProvider,
  sanitizeIngestPreferredModel
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
import { prepareIngestMessageMarkdown } from "@/components/enterprise-admin/IngestGPTMessageRenderer";

function testAgentScopedModelPreferences() {
  const doubao = getIngestModelOptionByProvider("doubao-pro");
  assert.equal(doubao.label, "Doubao-Seed-2.1-pro");
  assert.equal(doubao.defaultModel, "doubao-seed-2-1-pro-260628");
  assert.equal(DOUBAO_PRO_MODEL_ID, "doubao-seed-2-1-pro-260628");
  assert.equal(getIngestModelOptionByLabel("豆包 2.0 Pro").provider, "doubao-pro");
  assert.equal(getIngestModelOptionByLabel("doubao-seed-2-0-pro-260215").provider, "doubao-pro");
  assert.equal(sanitizeIngestPreferredModel("doubao-seed-2-0-pro-260215"), "");
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
  const ingestClientSource = readFileSync(path.join(
    process.cwd(),
    "lib/enterprise/ingest-client.ts"
  ), "utf8");
  const doubaoHealthSource = readFileSync(path.join(
    process.cwd(),
    "lib/enterprise/doubao-health-check.ts"
  ), "utf8");
  const pickerPosition = shellSource.indexOf("<IngestGPTModelPicker", shellSource.indexOf("items-center justify-end"));
  const voicePosition = shellSource.indexOf("<Mic", pickerPosition);

  assert.ok(pickerPosition > -1, "the Web composer must render the model selector");
  assert.ok(voicePosition > pickerPosition, "the model selector must remain in the Web composer toolbar");
  assert.doesNotMatch(shellSource, /<div className="hidden">\s*<IngestGPTModelPicker/);
  assert.match(shellSource.slice(pickerPosition, voicePosition), /compact/);
  assert.match(shellSource.slice(pickerPosition, voicePosition), /align="right"/);
  assert.doesNotMatch(shellSource, /<Scissors/);
  assert.doesNotMatch(shellSource, /<Paperclip/);
  assert.match(shellSource, /type=\{isParsing \? "button" : "submit"\}/);
  assert.match(shellSource, /onClick=\{isParsing \? onCancel : undefined\}/);
  assert.match(shellSource, /停止本轮识别与生成/);
  assert.doesNotMatch(shellSource, /isOrganizeOpen/);
  assert.doesNotMatch(shellSource, /handleUploadClick/);
  assert.match(pickerSource, /provider === "doubao-pro"/);
  assert.match(pickerSource, /badge: "豆"/);
  assert.match(pickerSource, /暂未连接/);
  assert.match(pickerSource, /disabled=\{isUnavailable\}/);
  assert.doesNotMatch(pickerSource, /投喂端只是 IDE/);
  assert.doesNotMatch(pickerSource, /Provider：/);
  assert.doesNotMatch(pickerSource, /option\.description/);
  assert.doesNotMatch(pickerSource, /option\.scenario/);
  assert.match(pickerSource, /compact\s*\?\s*INGEST_MODEL_OPTIONS\.filter/);
  assert.match(pickerSource, /:\s*INGEST_MODEL_OPTIONS/);
  assert.match(pickerSource, /fixed inset-x-4 bottom-24/);
  assert.match(pickerSource, /max-h-\[calc\(100dvh-8rem\)\]/);
  assert.match(pickerSource, /overflow-y-auto/);
  assert.match(modeToggleSource, /const requestVersion = \+\+doubaoHealthRequestVersionRef\.current;\s+const targetAgentId = activeAgent\.id;\s+const nextModel/);
  assert.match(modeToggleSource, /activeAgentIdRef\.current !== targetAgentId/);
  assert.match(modeToggleSource, /doubaoHealthRequestVersionRef\.current \+= 1;\s+\}, \[activeAgent\.id\]\)/);
  assert.match(
    modeToggleSource,
    /provider: doubaoOption\.provider,[\s\S]*?testRequest: false/,
    "Startup availability checks must not consume a real Doubao completion."
  );
  assert.match(
    modeToggleSource,
    /if \(nextModel\.provider === "doubao-pro"\)[\s\S]*?testRequest: false/,
    "Selecting Doubao must use a passive configuration check."
  );
  assert.match(
    modeToggleSource,
    /testRequest: selectedModelOption\.provider === "doubao-pro" \? true : undefined/,
    "Only an explicit user connection check may make a real Doubao health request."
  );
  assert.match(
    ingestClientSource,
    /if \(modelProvider !== "doubao-pro"\) \{[\s\S]*?checkGptHealthStatus\(/,
    "The existing DeepSeek and legacy-provider preflight must remain intact."
  );
  assert.match(ingestClientSource, /params\.set\("testRequest", input\.testRequest === true \? "true" : "false"\)/);
  assert.match(doubaoHealthSource, /if \(input\.testRequest !== true\)/);
  assert.match(doubaoHealthSource, /testedHealthRequests/);
  assert.match(doubaoHealthSource, /runWithDoubaoRequestSlot/);
  assert.match(modeToggleSource, /function handleCancelIngest\(\)/);
  assert.match(modeToggleSource, /输入内容和附件已保留/);
  assert.match(modeToggleSource, /onCancel:\s*handleCancelIngest/);
  assert.match(healthRouteSource, /await requireAdminIngestActor\(request/);
  assert.match(healthRouteSource, /testRequest: url\.searchParams\.get\("testRequest"\) === "true"/);
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
      requestedModel: "doubao-seed-2-1-pro-260628",
      actualModel: "doubao-seed-2-1-pro-260628",
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
      requestedModel: "doubao-seed-2-1-pro-260628",
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
  assert.equal(fallback.requestedModel, "doubao-seed-2-1-pro-260628");
  assert.equal(fallback.actualModel, "deepseek-v4-pro");
  assert.equal(fallback.fallbackUsed, true);
  assert.deepEqual(fallback.modelDiagnostics, {
    fallbackChain: ["doubao-pro", "deepseek-pro"]
  });

  const clientSource = readFileSync(path.join(process.cwd(), "lib/enterprise/ingest-client.ts"), "utf8");
  const routeSource = readFileSync(path.join(process.cwd(), "app/api/admin/kb/ingest/gpt/route.ts"), "utf8");

  assert.match(clientSource, /preserveRawSelectedModelOutput\s*\?\s*visibleReply\s*:\s*applyExpressionLayer/);
  assert.match(clientSource, /preserveRawOutput\s*\?\s*chunk\s*:\s*renderer\.formatStream\(chunk\)/);
  assert.match(clientSource, /draft\.replyMarkdown\s*=\s*styledReply/);
  assert.match(routeSource, /result\.provider === "doubao"/);
  assert.match(routeSource, /result\.provider === "deepseek"/);
  assert.match(routeSource, /output:\s*rawReply/);
  assert.match(routeSource, /changed:\s*false/);
  assert.match(routeSource, /platform === "web"/);
  assert.match(routeSource, /strictModelAffinity/);
  assert.match(routeSource, /ADMIN_INGEST_MODEL_AFFINITY_MISMATCH/);
  assert.match(routeSource, /系统已拒绝该结果且未切换其他模型/);
  assert.match(routeSource, /retryable:\s*isMissingKey \|\| isSafetyRejection \? false : fallback\.retryable/);

  const rendererRawMarkdown = "\n# 模型原文\n\n解析失败只是正文内容，不得被通用错误清洗替换。  \n\n```text\nRENDERER_RAW_SENTINEL\n```\n";
  assert.equal(
    prepareIngestMessageMarkdown(rendererRawMarkdown, "deepseek"),
    rendererRawMarkdown,
    "The final renderer must keep strict DeepSeek Markdown byte-for-byte."
  );
  assert.equal(
    prepareIngestMessageMarkdown(rendererRawMarkdown, "doubao"),
    rendererRawMarkdown,
    "The final renderer must keep strict Doubao Markdown byte-for-byte."
  );
  assert.equal(prepareIngestMessageMarkdown(rendererRawMarkdown, "deepseek-pro"), rendererRawMarkdown);
  assert.equal(prepareIngestMessageMarkdown(rendererRawMarkdown, "doubao-pro"), rendererRawMarkdown);
}

async function testFinalSelectedModelCompletionKeepsRawMarkdown(input: {
  provider: "deepseek" | "doubao";
  modelProvider: "deepseek-pro" | "doubao-pro";
  model: "deepseek-v4-pro" | "doubao-seed-2-1-pro-260628";
  label: "DeepSeek-V4-Pro" | "Doubao-Seed-2.1-pro";
}) {
  const originalFetch = globalThis.fetch;
  const rawMarkdown = `\n# 完成态${input.label}原文\n\n尾随两个空格必须保留。  \n\n\`\`\`text\n${input.modelProvider.toUpperCase()}_RAW_COMPLETION_SENTINEL\n\`\`\`\n`;

  globalThis.fetch = async (request) => {
    if (String(request).includes("/api/admin/kb/ingest/models/health")) {
      return new Response(JSON.stringify({
        ok: true,
        configured: true,
        provider: input.modelProvider,
        baseUrlConfigured: true,
        modelConfigured: true,
        apiKeyConfigured: true,
        selectedModelLabel: input.label,
        model: input.model,
        actualModel: input.model,
        mode: "highest",
        message: `${input.label} 接口可用`,
        diagnostics: [],
        requestTested: true
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      ok: true,
      data: {
        provider: input.provider,
        requestedProvider: input.modelProvider,
        actualProvider: input.modelProvider,
        model: input.model,
        modelDisplayName: input.label,
        requestedModel: input.model,
        actualModel: input.model,
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
      text: `验证${input.label}完成态原文`,
      category: "测试",
      model: input.label,
      modelProvider: input.modelProvider,
      selectedModelLabel: input.label,
      agent: {
        id: `${input.modelProvider}-raw-agent`,
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
    assert.equal(result.requestedProvider, input.modelProvider);
    assert.equal(result.actualProvider, input.modelProvider);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function main() {
  testAgentScopedModelPreferences();
  testDoubaoHealthAvailabilityBoundary();
  testPickerPlacementAndProviderIdentity();
  testFallbackMetadataAndRawBodyBoundary();
  await testFinalSelectedModelCompletionKeepsRawMarkdown({
    provider: "deepseek",
    modelProvider: "deepseek-pro",
    model: "deepseek-v4-pro",
    label: "DeepSeek-V4-Pro"
  });
  await testFinalSelectedModelCompletionKeepsRawMarkdown({
    provider: "doubao",
    modelProvider: "doubao-pro",
    model: "doubao-seed-2-1-pro-260628",
    label: "Doubao-Seed-2.1-pro"
  });

  console.log("admin ingest per-Agent DeepSeek/Doubao selector tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
