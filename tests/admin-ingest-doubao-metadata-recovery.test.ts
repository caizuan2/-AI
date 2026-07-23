import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  runDoubaoMetadataRecovery
} from "../lib/enterprise/doubao-ingest-client";
import {
  retryDoubaoKnowledgeDraftMetadata
} from "../lib/enterprise/ingest-client";
import {
  DOUBAO_PRO_MODEL_ID
} from "../lib/enterprise/ingest-model-options";
import type {
  IngestChatAgent,
  IngestKnowledgeDraft
} from "../lib/enterprise/mock-chat";

const originalFetch = globalThis.fetch;
const originalEnv = {
  ARK_API_KEY: process.env.ARK_API_KEY,
  DOUBAO_API_KEY: process.env.DOUBAO_API_KEY,
  DOUBAO_PRO_MODEL: process.env.DOUBAO_PRO_MODEL,
  DOUBAO_MODEL: process.env.DOUBAO_MODEL,
  DOUBAO_METADATA_RECOVERY_TIMEOUT_MS: process.env.DOUBAO_METADATA_RECOVERY_TIMEOUT_MS
};

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function createSseResponse(content: string, responseId: string) {
  const payload = [
    `data: ${JSON.stringify({
      id: responseId,
      model: DOUBAO_PRO_MODEL_ID,
      created: 1_786_000_000,
      choices: [{
        delta: { role: "assistant", content },
        finish_reason: "stop"
      }]
    })}\n\n`,
    `data: ${JSON.stringify({
      id: responseId,
      model: DOUBAO_PRO_MODEL_ID,
      choices: [],
      usage: {
        prompt_tokens: 120,
        completion_tokens: 180,
        total_tokens: 300
      }
    })}\n\n`,
    "data: [DONE]\n\n"
  ].join("");

  return new Response(payload, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8"
    }
  });
}

const exactReply = "\r\n# 豆包原始正文  \r\n\r\n```text\r\n首尾空白、CRLF 与代码块必须逐字保留。\r\n```\r\n";
const validMetadata = JSON.stringify({
  knowledgeDraft: {
    title: "新客户破冰引导",
    summary: "围绕新客户破冰阶段整理的执行重点。",
    category: "讲事业沟通",
    tags: ["破冰", "客户引导"],
    standardQuestion: "刚加上客户后应该如何破冰？",
    saveRecommendation: "可以入库",
    missingFields: [],
    trainingScore: 92
  },
  saveRecommendation: "可以入库"
});

async function testProviderMetadataRecovery() {
  process.env.ARK_API_KEY = "test-ark-key";
  delete process.env.DOUBAO_API_KEY;
  delete process.env.DOUBAO_PRO_MODEL;
  delete process.env.DOUBAO_MODEL;
  process.env.DOUBAO_METADATA_RECOVERY_TIMEOUT_MS = "10000";

  const requestBodies: Array<Record<string, unknown>> = [];
  let callCount = 0;

  globalThis.fetch = async (_url, init) => {
    callCount += 1;
    requestBodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);

    return createSseResponse(
      callCount === 1 ? "{\"knowledgeDraft\":{\"title\":\"未闭合\"" : validMetadata,
      `metadata-recovery-${callCount}`
    );
  };

  const result = await runDoubaoMetadataRecovery({
    input: "刚加上客户是宝妈，怎么破冰呢",
    attachments: [],
    agentId: "expert-career",
    expertId: "expert-career",
    agentName: "讲事业导师",
    category: "讲事业沟通",
    source: "admin_ingest",
    platform: "web",
    syncTarget: ["web", "exe", "apk"],
    tenantId: "tenant-test",
    userId: "user-test",
    preferredModel: DOUBAO_PRO_MODEL_ID,
    selectedModelLabel: "Doubao-Seed-2.1-pro",
    modelDisplayName: "Doubao-Seed-2.1-pro",
    replyMarkdown: exactReply,
    sourceResponseId: "visible-response-original",
    requestId: "metadata-recovery-provider-test"
  });

  assert.equal(callCount, 2, "Malformed metadata should trigger exactly one same-model structure retry.");
  assert.equal(result.actualModel, DOUBAO_PRO_MODEL_ID);
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.replyMarkdown, exactReply);
  assert.equal(result.knowledgeDraft.standardAnswer, exactReply);
  assert.equal(result.structured.answer, exactReply);
  assert.equal(result.sourceResponseId, "visible-response-original");
  assert.ok(result.diagnostics.includes("doubao:metadataStructureAttempts:2"));
  assert.ok(requestBodies.every((body) => body.model === DOUBAO_PRO_MODEL_ID));
  assert.ok(requestBodies.every((body) => body.max_tokens === 1000));

  let invalidCalls = 0;
  globalThis.fetch = async () => {
    invalidCalls += 1;
    return createSseResponse("{}", `metadata-invalid-${invalidCalls}`);
  };
  await assert.rejects(
    () => runDoubaoMetadataRecovery({
      input: "测试无效元数据",
      attachments: [],
      source: "admin_ingest",
      platform: "web",
      syncTarget: ["web"],
      preferredModel: DOUBAO_PRO_MODEL_ID,
      selectedModelLabel: "Doubao-Seed-2.1-pro",
      modelDisplayName: "Doubao-Seed-2.1-pro",
      replyMarkdown: exactReply,
      sourceResponseId: "visible-response-invalid"
    }),
    (error: unknown) => Boolean(
      error
      && typeof error === "object"
      && (error as { code?: unknown }).code === "DOUBAO_RESPONSE_PARSE_FAILED"
    )
  );
  assert.equal(invalidCalls, 2);
}

async function testClientMetadataBinding() {
  const agent: IngestChatAgent = {
    id: "expert-career",
    expertId: "expert-career",
    name: "讲事业导师",
    role: "讲事业沟通",
    description: "固定知识库专家",
    avatar: "讲",
    tone: "amber",
    knowledgeBaseId: "kb-career-mentor",
    namespace: "agent:expert-career:kb:kb-career-mentor"
  };
  const draft: IngestKnowledgeDraft = {
    id: "job-metadata-recovery",
    jobId: "job-metadata-recovery",
    title: "暂缓入库",
    category: "讲事业沟通",
    tags: [],
    summary: "元数据暂未完成",
    standardQuestion: "刚加上客户应该怎么破冰？",
    standardAnswer: exactReply,
    standardAnswers: [exactReply],
    trainingScore: 60,
    recommendation: "暂不入库",
    saveStatus: "待确认",
    providerUsed: "doubao",
    model: "Doubao-Seed-2.1-pro",
    sourceModel: DOUBAO_PRO_MODEL_ID,
    actualModel: DOUBAO_PRO_MODEL_ID,
    responseId: "visible-response-original",
    replyMarkdown: exactReply,
    fallbackUsed: false
  };
  let requestBody: Record<string, unknown> = {};

  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;

    return new Response(JSON.stringify({
      ok: true,
      data: {
        provider: "doubao",
        requestedProvider: "doubao-pro",
        actualProvider: "doubao-pro",
        model: DOUBAO_PRO_MODEL_ID,
        requestedModel: DOUBAO_PRO_MODEL_ID,
        actualModel: DOUBAO_PRO_MODEL_ID,
        selectedModelLabel: "Doubao-Seed-2.1-pro",
        modelDisplayName: "Doubao-Seed-2.1-pro",
        modelMode: "highest",
        fallback: false,
        fallbackUsed: false,
        jobId: requestBody.jobId,
        messageId: requestBody.messageId,
        attemptId: requestBody.attemptId,
        sourceResponseId: requestBody.sourceResponseId,
        metadataResponseId: "metadata-response-new",
        metadataState: "ready",
        replyMarkdown: requestBody.replyMarkdown,
        knowledgeDraft: {
          ...JSON.parse(validMetadata).knowledgeDraft,
          standardAnswer: requestBody.replyMarkdown
        },
        structured: {
          title: "新客户破冰引导",
          category: "讲事业沟通",
          summary: "围绕新客户破冰阶段整理的执行重点。",
          tags: ["破冰", "客户引导"],
          question: "刚加上客户后应该如何破冰？",
          answer: requestBody.replyMarkdown,
          confidence: 92,
          saveSuggestion: true,
          followUpQuestions: []
        },
        saveRecommendation: "可以入库",
        records: []
      }
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: undefined
  });
  const result = await (async () => {
    try {
      return await retryDoubaoKnowledgeDraftMetadata({
        originalInput: "刚加上客户是宝妈，怎么破冰呢",
        replyMarkdown: exactReply,
        sourceResponseId: "visible-response-original",
        messageId: "assistant-result-current",
        draft,
        agent,
        platform: "web"
      });
    } finally {
      if (cryptoDescriptor) {
        Object.defineProperty(globalThis, "crypto", cryptoDescriptor);
      } else {
        delete (globalThis as { crypto?: Crypto }).crypto;
      }
    }
  })();

  assert.equal(requestBody.operation, "retry_doubao_metadata");
  assert.equal(requestBody.jobId, draft.jobId);
  assert.equal(requestBody.replyMarkdown, exactReply);
  assert.equal("expectedReplyHash" in requestBody, false);
  assert.match(String(requestBody.attemptId), /^metadata-recovery-.+:attempt-1$/);
  assert.equal(requestBody.modelProvider, "doubao-pro");
  assert.equal(requestBody.preferredModel, DOUBAO_PRO_MODEL_ID);
  assert.equal(result.replyMarkdown, exactReply);
  assert.equal(result.draft.replyMarkdown, exactReply);
  assert.equal(result.draft.standardAnswer, exactReply);
  assert.deepEqual(result.draft.standardAnswers, [exactReply]);
  assert.equal(result.draft.responseId, draft.responseId);
  assert.equal(result.draft.jobId, draft.jobId);
  assert.equal(result.draft.saveStatus, "待确认");
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.records.filter((record) => record.jobId === draft.jobId).length, 1);
}

function testStaticSafetyContracts() {
  const routeSource = readFileSync("app/api/admin/kb/ingest/gpt/route.ts", "utf8");
  const clientSource = readFileSync("lib/enterprise/ingest-client.ts", "utf8");
  const loggerSource = readFileSync("lib/enterprise/ingest-logger.ts", "utf8");
  const toggleSource = readFileSync("components/enterprise-admin/IngestModeToggle.tsx", "utf8");
  const shellSource = readFileSync("components/enterprise-admin/IngestChatGPTShell.tsx", "utf8");

  assert.match(routeSource, /claimEnterpriseDoubaoMetadataRecovery/);
  assert.match(routeSource, /completeEnterpriseDoubaoMetadataRecovery/);
  assert.match(routeSource, /failEnterpriseDoubaoMetadataRecovery/);
  assert.match(routeSource, /claimedJob\.recoveryState === "completed"/);
  assert.match(routeSource, /doubao:metadataRecoveryIdempotent:true/);
  assert.doesNotMatch(clientSource, /crypto\.subtle/);
  assert.doesNotMatch(clientSource, /expectedReplyHash/);
  assert.match(loggerSource, /DOUBAO_METADATA_RECOVERY_LEASE_MS/);
  assert.match(loggerSource, /recoveryState: "completed"/);
  assert.match(loggerSource, /豆包知识草稿元数据尚未完成，不能正式入库/);
  assert.match(loggerSource, /exactStoredRecoveryReply !== suppliedReplyMarkdown/);
  assert.match(
    loggerSource,
    /storedReplyMarkdown\.trim\(\) !== suppliedReplyMarkdown\.trim\(\)/,
  );
  assert.match(toggleSource, /currentDraft\.replyMarkdown !== targetMessage\.content/);
  assert.match(toggleSource, /latestAssistantResult\?\.id !== messageId/);
  assert.match(shellSource, /重新整理知识草稿/);
  assert.match(shellSource, /message\.gptProof\?\.responseId === draft\.responseId/);
  assert.match(shellSource, /draft\.replyMarkdown === message\.content/);
}

async function main() {
  try {
    await testProviderMetadataRecovery();
    await testClientMetadataBinding();
    testStaticSafetyContracts();
    console.log("admin-ingest-doubao-metadata-recovery tests passed");
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
}

void main();
