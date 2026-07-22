import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildDoubaoChatCompletionsUrl,
  classifyDoubaoResponseError,
  extractDoubaoReplyMarkdown,
  runDoubaoAdminIngest
} from "../lib/enterprise/doubao-ingest-client";
import { runDeepSeekAdminIngest } from "../lib/enterprise/deepseek-ingest-client";
import { checkDoubaoIngestHealth } from "../lib/enterprise/doubao-health-check";
import {
  DOUBAO_PRO_MODEL_ID,
  getIngestModelOptionByProvider,
  normalizeIngestModelProvider,
  resolveIngestActualModel,
  resolveIngestModelRuntime
} from "../lib/enterprise/ingest-model-options";
import {
  buildEnterpriseFallbackChain,
  modelTypeToProvider,
  unifiedRouter
} from "../lib/enterprise/gpt-os-model-router-v2";
import {
  assertAdminIngestModelAffinity,
  resolveAdminIngestModelProvider,
  runAdminIngestWithSelectedModel
} from "../lib/enterprise/ingest-model-provider";

const originalFetch = globalThis.fetch;
const originalEnv = {
  ARK_API_KEY: process.env.ARK_API_KEY,
  DOUBAO_API_KEY: process.env.DOUBAO_API_KEY,
  DOUBAO_BASE_URL: process.env.DOUBAO_BASE_URL,
  DOUBAO_PRO_MODEL: process.env.DOUBAO_PRO_MODEL,
  DOUBAO_MODEL: process.env.DOUBAO_MODEL,
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL,
  DEEPSEEK_PRO_MODEL: process.env.DEEPSEEK_PRO_MODEL
};

const restoreEnv = () => {
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
};

async function main() {
try {
  assert.equal(normalizeIngestModelProvider("doubao"), "doubao-pro");
  assert.equal(normalizeIngestModelProvider("Doubao-Seed-2.1-pro"), "doubao-pro");
  assert.equal(normalizeIngestModelProvider("豆包 2.0 Pro"), "doubao-pro");
  assert.equal(getIngestModelOptionByProvider("doubao-pro").requiresApiKeyEnv, "ARK_API_KEY");
  assert.equal(DOUBAO_PRO_MODEL_ID, "doubao-seed-2-1-pro-260628");

  delete process.env.DOUBAO_PRO_MODEL;
  delete process.env.DOUBAO_MODEL;
  assert.equal(resolveIngestActualModel("doubao-pro"), DOUBAO_PRO_MODEL_ID);
  process.env.DOUBAO_PRO_MODEL = "ep-doubao-provider-test";
  assert.equal(
    resolveIngestActualModel("doubao-pro"),
    DOUBAO_PRO_MODEL_ID,
    "The admin-ingest Doubao selection must stay pinned to Doubao-Seed-2.1-pro."
  );
  assert.equal(
    resolveIngestModelRuntime({
      provider: "doubao-pro",
      preferredModel: DOUBAO_PRO_MODEL_ID
    }).actualModel,
    DOUBAO_PRO_MODEL_ID,
    "The admin-ingest runtime must not drift from Doubao-Seed-2.1-pro when another Ark model is configured."
  );

  assert.equal(
    unifiedRouter({ selectedModelLabel: "Doubao-Seed-2.1-pro", preferredModel: "doubao-pro" }),
    "doubao-pro"
  );
  assert.equal(
    resolveAdminIngestModelProvider({ modelProvider: "doubao-pro" }).provider,
    "doubao-pro"
  );
  assert.deepEqual(
    buildEnterpriseFallbackChain("doubao-pro"),
    ["doubao-pro", "deepseek-pro", "qwen", "kimi", "deepseek-flash"]
  );
  assert.deepEqual(
    buildEnterpriseFallbackChain("deepseek-pro"),
    ["deepseek-pro", "qwen", "kimi", "deepseek-flash"],
    "Adding Doubao must not change the established DeepSeek fallback path."
  );
  assert.equal(modelTypeToProvider("doubao-pro"), "doubao");

  assert.equal(
    buildDoubaoChatCompletionsUrl("https://ark.cn-beijing.volces.com/api/v3"),
    "https://ark.cn-beijing.volces.com/api/v3/chat/completions"
  );
  assert.equal(classifyDoubaoResponseError(401).code, "DOUBAO_API_KEY_INVALID");
  assert.equal(classifyDoubaoResponseError(429, "rate limit").code, "DOUBAO_RATE_LIMITED");
  assert.equal(classifyDoubaoResponseError(429, "insufficient quota").code, "DOUBAO_QUOTA_EXCEEDED");
  assert.equal(classifyDoubaoResponseError(400, "content policy safety").code, "DOUBAO_SAFETY_REJECTED");
  assert.equal(classifyDoubaoResponseError(404, "model not found").code, "DOUBAO_MODEL_UNAVAILABLE");
  assert.equal(classifyDoubaoResponseError(503).code, "DOUBAO_REQUEST_FAILED");

  delete process.env.ARK_API_KEY;
  delete process.env.DOUBAO_API_KEY;
  const missingKeyHealth = await checkDoubaoIngestHealth({ testRequest: false });
  assert.equal(missingKeyHealth.ok, false);
  assert.equal(missingKeyHealth.errorCode, "DOUBAO_API_KEY_MISSING");

  const exactReplyMarkdown = "\n# 豆包原始标题\n\n正文保留两个空行、尾部空格。  \n\n```text\nRAW_MARKDOWN_SENTINEL\n```\n";
  const providerContent = JSON.stringify({
    replyMarkdown: exactReplyMarkdown,
    knowledgeDraft: {
      title: "豆包投喂测试",
      summary: "验证完整上下文与原文透传。",
      category: "测试",
      tags: ["豆包", "Ark"],
      importance: "high",
      standardQuestion: "豆包上下文是否完整？",
      standardAnswer: "完整。",
      keyPoints: ["上下文完整", "原文透传"],
      actionItems: ["保留原文"],
      missingFields: []
    },
    suggestedQuestions: ["是否保留了完整 Markdown？"],
    diagnostics: ["provider-contract-test"]
  });

  assert.equal(extractDoubaoReplyMarkdown(providerContent), exactReplyMarkdown);
  assert.equal(
    extractDoubaoReplyMarkdown(`\`\`\`json\n${providerContent}\n\`\`\``),
    exactReplyMarkdown
  );

  process.env.ARK_API_KEY = "ark-test-secret";
  delete process.env.DOUBAO_API_KEY;
  process.env.DOUBAO_BASE_URL = "https://ark.example.test/api/v3";
  process.env.DOUBAO_PRO_MODEL = "ep-doubao-provider-test";

  let capturedUrl = "";
  let capturedAuthorization = "";
  let capturedRequestBody: Record<string, unknown> = {};

  globalThis.fetch = async (url, init) => {
    capturedUrl = String(url);
    const headers = new Headers(init?.headers);
    capturedAuthorization = headers.get("authorization") ?? "";
    capturedRequestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;

    return new Response(JSON.stringify({
      id: "doubao-response-contract-test",
      model: "ep-doubao-provider-test",
      created: 1_786_000_000,
      choices: [{ message: { role: "assistant", content: providerContent } }],
      usage: {
        prompt_tokens: 120,
        completion_tokens: 240,
        total_tokens: 360
      }
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  const doubaoInput = {
    input: "CURRENT_INPUT_SENTINEL",
    attachments: [{
      fileName: "doubao-context.pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      parseStatus: "parsed",
      extractedText: "ATTACHMENT_TEXT_SENTINEL"
    }],
    agentId: "agent-doubao-test",
    expertId: "expert-doubao-test",
    agentName: "豆包测试专家",
    category: "豆包测试知识库",
    agentDescription: "AGENT_DESCRIPTION_SENTINEL",
    targetUser: "TARGET_USER_SENTINEL",
    source: "admin_ingest",
    platform: "web",
    syncTarget: ["web"],
    preferredModel: "ep-doubao-provider-test",
    selectedModelLabel: "Doubao-Seed-2.1-pro",
    recentMessages: [{ role: "user", content: "RECENT_MESSAGE_SENTINEL" }],
    contextSummary: "LONG_CONTEXT_SUMMARY_SENTINEL",
    memoryContextText: "PUBLISHED_MEMORY_TEXT_SENTINEL",
    agentLearningInstruction: "AGENT_LEARNING_INSTRUCTION_SENTINEL",
    usedMemoryIds: ["MEMORY_ID_SENTINEL"],
    knowledgeContexts: [{
      id: "knowledge-context-test",
      title: "FIXED_KNOWLEDGE_TITLE_SENTINEL",
      content: "FIXED_KNOWLEDGE_CONTENT_SENTINEL",
      sourceId: "knowledge-chunk-test",
      score: 0.99
    }],
    previousKnowledgeDrafts: [{
      title: "PREVIOUS_DRAFT_SENTINEL",
      summary: "PREVIOUS_DRAFT_SUMMARY_SENTINEL"
    }],
    recentTrainingRecords: [{
      input: "TRAINING_INPUT_SENTINEL",
      resultTitle: "TRAINING_RESULT_SENTINEL",
      category: "豆包测试",
      saveStatus: "published"
    }],
    requestId: "request-doubao-contract-test"
  } satisfies Parameters<typeof runDoubaoAdminIngest>[0];
  const result = await runDoubaoAdminIngest(doubaoInput);

  assert.equal(capturedUrl, "https://ark.example.test/api/v3/chat/completions");
  assert.equal(capturedAuthorization, "Bearer ark-test-secret");
  assert.equal(capturedRequestBody.model, "ep-doubao-provider-test");
  assert.equal(capturedRequestBody.stream, false);

  const messages = capturedRequestBody.messages as Array<{ role: string; content: string }>;
  assert.equal(messages.length, 2);
  const finalPrompt = messages.map((message) => message.content).join("\n");

  for (const sentinel of [
    "CURRENT_INPUT_SENTINEL",
    "ATTACHMENT_TEXT_SENTINEL",
    "AGENT_DESCRIPTION_SENTINEL",
    "TARGET_USER_SENTINEL",
    "RECENT_MESSAGE_SENTINEL",
    "LONG_CONTEXT_SUMMARY_SENTINEL",
    "PUBLISHED_MEMORY_TEXT_SENTINEL",
    "AGENT_LEARNING_INSTRUCTION_SENTINEL",
    "MEMORY_ID_SENTINEL",
    "FIXED_KNOWLEDGE_TITLE_SENTINEL",
    "FIXED_KNOWLEDGE_CONTENT_SENTINEL",
    "PREVIOUS_DRAFT_SENTINEL",
    "TRAINING_RESULT_SENTINEL"
  ]) {
    assert.match(finalPrompt, new RegExp(sentinel));
  }

  assert.equal(result.provider, "doubao");
  assert.equal(result.replyMarkdown, exactReplyMarkdown, "Provider replyMarkdown must pass through byte-for-byte as a JS string.");
  assert.equal(result.gptProof.deepenAttempts, 0, "Doubao must not rewrite the body through a quality-deepening retry.");
  assert.ok(result.diagnostics.includes("doubao:replyMarkdownPassthrough:true"));

  const routedResult = await runAdminIngestWithSelectedModel({
    ...doubaoInput,
    modelProvider: "doubao-pro"
  });
  assert.equal(routedResult.provider, "doubao", "A successful Doubao request must report the actual provider.");
  assert.equal(routedResult.requestedProvider, "doubao-pro");
  assert.equal(routedResult.actualProvider, "doubao-pro");
  assert.equal(routedResult.requestedModel, DOUBAO_PRO_MODEL_ID);
  assert.equal(capturedRequestBody.model, DOUBAO_PRO_MODEL_ID);
  assert.equal(routedResult.fallbackUsed, false);
  assert.ok(routedResult.diagnostics.includes("modelRouter:actualProvider:doubao-pro"));

  assert.doesNotThrow(() => assertAdminIngestModelAffinity({
    requestedProvider: "doubao-pro",
    requestedModel: "ep-doubao-provider-test",
    actualProvider: "doubao",
    actualModel: "ep-doubao-provider-test"
  }));
  assert.throws(() => assertAdminIngestModelAffinity({
    requestedProvider: "doubao-pro",
    requestedModel: "ep-doubao-provider-test",
    actualProvider: "deepseek",
    actualModel: "ep-doubao-provider-test"
  }), (error: unknown) => Boolean(
    error
    && typeof error === "object"
    && (error as { code?: unknown }).code === "ADMIN_INGEST_MODEL_AFFINITY_MISMATCH"
  ));
  assert.throws(() => assertAdminIngestModelAffinity({
    requestedProvider: "doubao-pro",
    requestedModel: "ep-doubao-provider-test",
    actualProvider: "doubao",
    actualModel: "unexpected-doubao-model"
  }), (error: unknown) => Boolean(
    error
    && typeof error === "object"
    && (error as { code?: unknown }).code === "ADMIN_INGEST_MODEL_AFFINITY_MISMATCH"
  ));

  const successfulDoubaoFetch = globalThis.fetch;
  const exactDeepSeekReplyMarkdown = "\n# DeepSeek 原始标题\n\n解析失败只是正文示例，不得被替换。  \n\n```text\nDEEPSEEK_RAW_MARKDOWN_SENTINEL\n```\n";
  const deepSeekProviderContent = JSON.stringify({
    replyMarkdown: exactDeepSeekReplyMarkdown,
    knowledgeDraft: {
      title: "DeepSeek 原文测试",
      summary: "验证严格单模型完成态原文透传。",
      category: "测试",
      tags: ["DeepSeek", "原文"],
      importance: "high",
      standardQuestion: "DeepSeek 是否保留原始 Markdown？",
      standardAnswer: "保留。",
      keyPoints: ["不清洗", "不改写"],
      actionItems: ["保留原文"],
      missingFields: []
    },
    suggestedQuestions: ["是否原样透传？"],
    diagnostics: ["deepseek-provider-contract-test"]
  });
  process.env.DEEPSEEK_API_KEY = "deepseek-test-secret";
  process.env.DEEPSEEK_BASE_URL = "https://deepseek.example.test";
  process.env.DEEPSEEK_PRO_MODEL = "deepseek-v4-pro";
  let strictDeepSeekCalls = 0;
  globalThis.fetch = async (url, init) => {
    strictDeepSeekCalls += 1;
    assert.equal(String(url), "https://deepseek.example.test/chat/completions");
    const requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    assert.equal(requestBody.model, "deepseek-v4-pro");

    return new Response(JSON.stringify({
      id: "deepseek-raw-passthrough-test",
      model: "deepseek-v4-pro",
      created: 1_786_000_001,
      choices: [{ message: { role: "assistant", content: deepSeekProviderContent } }],
      usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 }
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  const strictDeepSeekResult = await runDeepSeekAdminIngest({
    ...doubaoInput,
    preferredModel: "deepseek-v4-pro",
    selectedModelLabel: "DeepSeek-V4-Pro",
    strictModelAffinity: true
  });
  assert.equal(
    strictDeepSeekResult.replyMarkdown,
    exactDeepSeekReplyMarkdown,
    "Strict DeepSeek replyMarkdown must pass through byte-for-byte as a JS string."
  );
  assert.equal(strictDeepSeekResult.gptProof.deepenAttempts, 0, "Strict DeepSeek must not rewrite the body through a quality-deepening retry.");
  assert.equal(strictDeepSeekCalls, 1, "Strict DeepSeek must use one provider completion without a rewrite pass.");
  assert.ok(strictDeepSeekResult.diagnostics.includes("deepseek:replyMarkdownPassthrough:true"));
  globalThis.fetch = successfulDoubaoFetch;

  let crossProviderCallAfterAffinityMismatch = false;
  globalThis.fetch = async (url, init) => {
    if (!String(url).includes("ark.example.test")) {
      crossProviderCallAfterAffinityMismatch = true;
      return new Response("{}", { status: 500 });
    }

    const requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;

    return new Response(JSON.stringify({
      id: "doubao-affinity-mismatch-test",
      model: "unexpected-doubao-model",
      choices: [{ message: { role: "assistant", content: providerContent } }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      requested_model: requestBody.model
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  await assert.rejects(
    () => runAdminIngestWithSelectedModel({
      ...doubaoInput,
      modelProvider: "doubao-pro",
      strictModelAffinity: true
    }),
    (error: unknown) => Boolean(
      error
      && typeof error === "object"
      && (error as { code?: unknown }).code === "ADMIN_INGEST_MODEL_AFFINITY_MISMATCH"
    )
  );
  assert.equal(crossProviderCallAfterAffinityMismatch, false, "A strict Web model mismatch must fail without calling another provider.");
  globalThis.fetch = successfulDoubaoFetch;

  const health = await checkDoubaoIngestHealth({
    preferredModel: DOUBAO_PRO_MODEL_ID,
    selectedModelLabel: "Doubao-Seed-2.1-pro"
  });
  assert.equal(health.ok, true);
  assert.equal(health.provider, "doubao");
  assert.equal(health.actualModel, "ep-doubao-provider-test");

  process.env.DEEPSEEK_API_KEY = "deepseek-test-secret";
  process.env.DEEPSEEK_BASE_URL = "https://deepseek.example.test";
  process.env.DEEPSEEK_PRO_MODEL = "deepseek-v4-pro";
  const deepSeekFallbackContent = JSON.stringify({
    replyMarkdown: `# DeepSeek 回退正文\n\n${"这是独立供应商回退正文，不能继续标记为豆包。".repeat(80)}`,
    knowledgeDraft: {
      title: "DeepSeek 回退测试",
      summary: "验证实际供应商元数据。",
      category: "测试",
      standardQuestion: "回退后实际供应商是谁？",
      standardAnswer: "DeepSeek。"
    }
  });

  let deepSeekCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url).includes("ark.example.test")) {
      return new Response(JSON.stringify({ error: { message: "temporary unavailable" } }), {
        status: 503,
        headers: { "Content-Type": "application/json" }
      });
    }

    deepSeekCalls += 1;
    return new Response(JSON.stringify({
      id: "deepseek-fallback-response",
      model: "deepseek-v4-pro",
      created: 1_786_000_001,
      choices: [{ message: { role: "assistant", content: deepSeekFallbackContent } }],
      usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 }
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  await assert.rejects(
    () => runAdminIngestWithSelectedModel({
      ...doubaoInput,
      modelProvider: "doubao-pro",
      strictModelAffinity: true
    }),
    (error: unknown) => Boolean(
      error
      && typeof error === "object"
      && (error as { code?: unknown }).code === "DOUBAO_REQUEST_FAILED"
    )
  );
  assert.equal(deepSeekCalls, 0, "Strict Web Doubao failure must not call DeepSeek or any other provider.");

  const fallbackResult = await runAdminIngestWithSelectedModel({
    ...doubaoInput,
    modelProvider: "doubao-pro"
  });
  const fallbackDiagnostics: string[] = fallbackResult.diagnostics;
  assert.equal(fallbackResult.provider, "deepseek", "A Doubao failure must report the actual fallback provider.");
  assert.equal(fallbackResult.requestedProvider, "doubao-pro");
  assert.equal(fallbackResult.actualProvider, "deepseek-pro");
  assert.equal(fallbackResult.requestedModel, DOUBAO_PRO_MODEL_ID);
  assert.equal(fallbackResult.actualModel, "deepseek-v4-pro");
  assert.equal(fallbackResult.fallbackUsed, true);
  assert.equal(deepSeekCalls, 1, "Non-Web compatibility mode must keep the existing provider fallback.");
  assert.ok(fallbackDiagnostics.includes("modelRouter:actualProvider:deepseek-pro"));
  assert.ok(fallbackDiagnostics.some((item) => item.includes("doubao-pro:DOUBAO_REQUEST_FAILED")));

  let deepSeekCalledAfterSafetyRejection = false;
  globalThis.fetch = async (url) => {
    if (String(url).includes("ark.example.test")) {
      return new Response(JSON.stringify({ error: { message: "content policy safety rejection" } }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    deepSeekCalledAfterSafetyRejection = true;
    return new Response("{}", { status: 500 });
  };
  await assert.rejects(
    () => runAdminIngestWithSelectedModel({ ...doubaoInput, modelProvider: "doubao-pro" }),
    (error: unknown) => Boolean(
      error
      && typeof error === "object"
      && (error as { code?: unknown }).code === "DOUBAO_SAFETY_REJECTED"
    )
  );
  assert.equal(deepSeekCalledAfterSafetyRejection, false, "Safety rejection must not be bypassed through another provider.");

  const routeSource = readFileSync("app/api/admin/kb/ingest/gpt/route.ts", "utf8");
  assert.match(routeSource, /result\.provider === "doubao"/);
  assert.match(routeSource, /result\.provider === "deepseek"/);
  assert.match(routeSource, /output: rawReply/);
  assert.match(routeSource, /gptStyle:provider_passthrough:\$\{result\.provider\}/);
  assert.match(routeSource, /ADMIN_INGEST_MODEL_AFFINITY_MISMATCH/);
  assert.match(routeSource, /系统已拒绝该结果且未切换其他模型/);

  console.log("Admin ingest Doubao provider contract tests passed.");
} finally {
  globalThis.fetch = originalFetch;
  restoreEnv();
}
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
