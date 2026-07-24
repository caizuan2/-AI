import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_USER_ANSWER_MODEL_PROVIDER,
  USER_ANSWER_MODEL_OPTIONS,
  parseUserAnswerModelProvider
} from "../lib/ai-chat/user-answer-model";
import {
  USER_AGENT_INGEST_OUTPUT_MODE,
  runUserAgentIngestAnswer
} from "../lib/ai-chat/user-agent-ingest-answer";
import { runCareerMentorIngestAnswer } from "../lib/ai-chat/career-mentor-ingest-answer";
import {
  streamAiChatResult,
  type AiChatStreamEvent
} from "../lib/ai-chat/streaming";

const originalFetch = globalThis.fetch;
const originalEnv = {
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL,
  DEEPSEEK_PRO_MODEL: process.env.DEEPSEEK_PRO_MODEL,
  ARK_API_KEY: process.env.ARK_API_KEY,
  DOUBAO_API_KEY: process.env.DOUBAO_API_KEY,
  DOUBAO_BASE_URL: process.env.DOUBAO_BASE_URL,
  DOUBAO_PRO_MODEL: process.env.DOUBAO_PRO_MODEL
};

function restoreEnvironment() {
  globalThis.fetch = originalFetch;

  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function createSseResponse(model: string, content: string) {
  const splitAt = Math.max(1, Math.floor(content.length / 2));
  const payload = [
    `data: ${JSON.stringify({
      id: "user-answer-model-test",
      model,
      created: 1_786_000_000,
      choices: [{ delta: { role: "assistant", content: content.slice(0, splitAt) } }]
    })}\n\n`,
    `data: ${JSON.stringify({
      id: "user-answer-model-test",
      model,
      choices: [{ delta: { content: content.slice(splitAt) }, finish_reason: "stop" }]
    })}\n\n`,
    `data: ${JSON.stringify({
      id: "user-answer-model-test",
      model,
      choices: [],
      usage: { prompt_tokens: 80, completion_tokens: 120, total_tokens: 200 }
    })}\n\n`,
    "data: [DONE]\n\n"
  ].join("");

  return new Response(payload, {
    status: 200,
    headers: { "content-type": "text/event-stream; charset=utf-8" }
  });
}

function readDoubaoPhase(init?: RequestInit) {
  const body = JSON.parse(String(init?.body ?? "{}")) as {
    messages?: Array<{ content?: string }>;
  };
  const systemPrompt = body.messages?.[0]?.content ?? "";

  return systemPrompt.includes("后台知识元数据整理器") ? "metadata" : "visible";
}

async function main() {
  assert.equal(DEFAULT_USER_ANSWER_MODEL_PROVIDER, "deepseek-pro");
  assert.deepEqual(USER_ANSWER_MODEL_OPTIONS.map((option) => option.provider), [
    "deepseek-pro",
    "doubao-pro"
  ]);
  assert.deepEqual(USER_ANSWER_MODEL_OPTIONS.map((option) => option.model), [
    "deepseek-v4-pro",
    "doubao-seed-2-1-pro-260628"
  ]);
  assert.equal(parseUserAnswerModelProvider("deepseek-pro"), "deepseek-pro");
  assert.equal(parseUserAnswerModelProvider("doubao-pro"), "doubao-pro");
  assert.equal(parseUserAnswerModelProvider("qwen"), null);
  assert.equal(parseUserAnswerModelProvider("deepseek-flash"), null);
  assert.equal(parseUserAnswerModelProvider("openai"), null);

  process.env.DEEPSEEK_API_KEY = "user-answer-deepseek-test-key";
  process.env.DEEPSEEK_BASE_URL = "https://deepseek.user-answer.test/v1";
  process.env.DEEPSEEK_PRO_MODEL = "deepseek-v4-pro";
  process.env.ARK_API_KEY = "user-answer-doubao-test-key";
  delete process.env.DOUBAO_API_KEY;
  process.env.DOUBAO_BASE_URL = "https://doubao.user-answer.test/api/v3";
  process.env.DOUBAO_PRO_MODEL = "doubao-seed-2-1-pro-260628";

  const exactDeepSeekMarkdown = "\n# DeepSeek 用户端原文\n\n保留空行、引用和尾部空格。  \n\n> DEEPSEEK_USER_RAW\n";
  const exactDoubaoMarkdown = "\n# 豆包用户端原文\n\n保留空行、列表和尾部空格。  \n\n- DOUBAO_USER_RAW\n";
  const doubaoMetadata = JSON.stringify({
    knowledgeDraft: {
      title: "用户端豆包元数据",
      summary: "只用于后台元数据，不得改写正文。",
      category: "测试",
      tags: ["豆包"],
      standardQuestion: "是否原样输出？",
      standardAnswer: "是。",
      missingFields: []
    },
    suggestedQuestions: ["是否原样输出？"],
    diagnostics: ["user-answer-model-test"]
  });
  const capturedPrompts: string[] = [];
  const strictFailureUrls: string[] = [];
  let strictFailureProvider: "deepseek-pro" | "doubao-pro" | null = null;
  let deepSeekCalls = 0;
  let doubaoCalls = 0;

  globalThis.fetch = async (url, init) => {
    if (strictFailureProvider) {
      strictFailureUrls.push(String(url));
      const expectedHost = strictFailureProvider === "deepseek-pro"
        ? "deepseek.user-answer.test"
        : "doubao.user-answer.test";

      assert.match(String(url), new RegExp(expectedHost.replaceAll(".", "\\.")));

      return new Response(JSON.stringify({
        error: {
          code: "STRICT_MODEL_TEST_FAILURE",
          message: "selected provider unavailable"
        }
      }), {
        status: 401,
        headers: { "content-type": "application/json" }
      });
    }

    const requestBody = JSON.parse(String(init?.body ?? "{}")) as {
      model?: string;
      messages?: Array<{ role?: string; content?: string }>;
    };
    const prompt = requestBody.messages?.map((message) => message.content ?? "").join("\n") ?? "";
    capturedPrompts.push(prompt);

    if (String(url).includes("deepseek.user-answer.test")) {
      deepSeekCalls += 1;
      assert.equal(requestBody.model, "deepseek-v4-pro");

      return new Response(JSON.stringify({
        id: "deepseek-user-answer-test",
        model: "deepseek-v4-pro",
        created: 1_786_000_001,
        choices: [{
          message: {
            role: "assistant",
            content: JSON.stringify({
              replyMarkdown: exactDeepSeekMarkdown,
              knowledgeDraft: {
                title: "用户端DeepSeek原文",
                summary: "验证原样输出。",
                category: "测试",
                tags: ["DeepSeek"],
                importance: "high",
                standardQuestion: "是否原样输出？",
                standardAnswer: "是。",
                keyPoints: ["原样输出"],
                actionItems: ["不改写"],
                missingFields: []
              },
              suggestedQuestions: ["是否原样输出？"],
              diagnostics: ["user-answer-model-test"]
            })
          }
        }],
        usage: { prompt_tokens: 100, completion_tokens: 160, total_tokens: 260 }
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    doubaoCalls += 1;
    assert.equal(requestBody.model, "doubao-seed-2-1-pro-260628");

    return createSseResponse(
      "doubao-seed-2-1-pro-260628",
      readDoubaoPhase(init) === "metadata" ? doubaoMetadata : exactDoubaoMarkdown
    );
  };

  const commonInput = {
    originalQuestion: "请根据当前知识库回答。",
    contexts: [{
      id: "kks-fixed-knowledge",
      title: "瘦身KKS固定知识",
      content: "KKS_SCOPE_SENTINEL：只允许使用当前瘦身KKS资料。",
      sourceType: "markdown",
      sourceId: "kks-source",
      score: 0.98
    }],
    recentConversation: [{
      role: "user" as const,
      content: "这是上一轮用户问题。"
    }],
    agentId: "expert-kks",
    agentName: "瘦身KKS专业师",
    agentCategory: "健康管理",
    agentDescription: "只使用瘦身KKS固定知识库。",
    userId: "user-answer-model-test-user",
    requestId: "user-answer-model-test"
  };

  const deepSeekResult = await runUserAgentIngestAnswer({
    ...commonInput,
    modelProvider: "deepseek-pro"
  });
  assert.equal(deepSeekResult.answer, exactDeepSeekMarkdown);
  assert.equal(deepSeekResult.modelUsed, "deepseek-v4-pro");
  assert.equal(deepSeekResult.fallbackUsed, false);
  assert.equal(deepSeekResult.answerOutputMode, USER_AGENT_INGEST_OUTPUT_MODE);
  assert.equal(deepSeekCalls, 1);
  const kksDeepSeekPrompts = capturedPrompts.slice();
  assert.ok(kksDeepSeekPrompts.some((prompt) => prompt.includes("KKS_SCOPE_SENTINEL")));
  assert.equal(kksDeepSeekPrompts.some((prompt) => prompt.includes("HEALTH_SCOPE_SENTINEL")), false);

  const healthPromptStart = capturedPrompts.length;
  const healthDeepSeekResult = await runUserAgentIngestAnswer({
    ...commonInput,
    contexts: [{
      id: "health-fixed-knowledge",
      title: "大健康固定知识",
      content: "HEALTH_SCOPE_SENTINEL：只允许使用当前大健康专家资料。",
      sourceType: "markdown",
      sourceId: "health-source",
      score: 0.99
    }],
    agentId: "expert-health",
    agentName: "大健康专家",
    agentCategory: "大健康",
    agentDescription: "只使用大健康专家知识库。",
    requestId: "user-answer-model-health-deepseek-test",
    modelProvider: "deepseek-pro"
  });
  assert.equal(healthDeepSeekResult.answer, exactDeepSeekMarkdown);
  assert.equal(healthDeepSeekResult.modelUsed, "deepseek-v4-pro");
  assert.equal(deepSeekCalls, 2);
  const healthPrompts = capturedPrompts.slice(healthPromptStart);
  assert.ok(healthPrompts.some((prompt) => prompt.includes("HEALTH_SCOPE_SENTINEL")));
  assert.equal(healthPrompts.some((prompt) => prompt.includes("KKS_SCOPE_SENTINEL")), false);

  const kksDoubaoPromptStart = capturedPrompts.length;
  const doubaoResult = await runUserAgentIngestAnswer({
    ...commonInput,
    requestId: "user-answer-model-doubao-test",
    modelProvider: "doubao-pro"
  });
  assert.equal(doubaoResult.answer, exactDoubaoMarkdown);
  assert.equal(doubaoResult.modelUsed, "doubao-seed-2-1-pro-260628");
  assert.equal(doubaoResult.fallbackUsed, false);
  assert.equal(doubaoResult.answerOutputMode, USER_AGENT_INGEST_OUTPUT_MODE);
  assert.equal(doubaoCalls, 2, "豆包只允许同一模型完成正文和后台元数据两个阶段。");
  const kksDoubaoPrompts = capturedPrompts.slice(kksDoubaoPromptStart);
  assert.ok(kksDoubaoPrompts.some((prompt) => prompt.includes("KKS_SCOPE_SENTINEL")));
  assert.equal(kksDoubaoPrompts.some((prompt) => prompt.includes("HEALTH_SCOPE_SENTINEL")), false);

  const careerDoubaoResult = await runCareerMentorIngestAnswer({
    originalQuestion: "宝妈刚加好友怎么破冰？",
    scenarioQuestion: "宝妈刚加好友怎么破冰？",
    careerMentorStage: "ice_breaking",
    contexts: [{
      id: "career-fixed-knowledge",
      title: "讲事业第一步破冰",
      content: "CAREER_SCOPE_SENTINEL：只允许使用讲事业导师当前阶段资料。",
      sourceType: "markdown",
      sourceId: "career-source",
      score: 0.99
    }],
    recentConversation: [],
    agentId: "expert-career",
    modelProvider: "doubao-pro",
    userId: "user-answer-model-test-user",
    requestId: "user-answer-model-career-doubao-test"
  });
  assert.equal(careerDoubaoResult.answer, exactDoubaoMarkdown);
  assert.equal(careerDoubaoResult.modelUsed, "doubao-seed-2-1-pro-260628");
  assert.equal(careerDoubaoResult.fallbackUsed, false);
  assert.equal(doubaoCalls, 4, "讲事业导师选择豆包后，正文和元数据阶段都必须保持豆包。");
  assert.ok(capturedPrompts.some((prompt) => prompt.includes("CAREER_SCOPE_SENTINEL")));

  strictFailureProvider = "deepseek-pro";
  strictFailureUrls.length = 0;
  await assert.rejects(runUserAgentIngestAnswer({
    ...commonInput,
    requestId: "user-answer-model-deepseek-strict-failure",
    modelProvider: "deepseek-pro"
  }));
  assert.equal(strictFailureUrls.length, 1);
  assert.equal(strictFailureUrls.every((url) => url.includes("deepseek.user-answer.test")), true);

  strictFailureProvider = "doubao-pro";
  strictFailureUrls.length = 0;
  await assert.rejects(runUserAgentIngestAnswer({
    ...commonInput,
    requestId: "user-answer-model-doubao-strict-failure",
    modelProvider: "doubao-pro"
  }));
  assert.equal(strictFailureUrls.length, 1);
  assert.equal(strictFailureUrls.every((url) => url.includes("doubao.user-answer.test")), true);
  strictFailureProvider = null;

  const streamEvents: AiChatStreamEvent[] = [];
  await streamAiChatResult({
    answer: exactDoubaoMarkdown,
    answer_output_mode: USER_AGENT_INGEST_OUTPUT_MODE,
    conversation_id: "conversation-model-selection",
    message_id: "message-model-selection",
    mode: "fast",
    customer_answer: "",
    sources: [],
    provider_status: "ok",
    actualModel: "doubao-seed-2-1-pro-260628",
    provider: "doubao-pro",
    fallbackUsed: false,
    runtime_input: {
      agentId: "expert-kks",
      knowledgeBaseId: "kb-kks-slim",
      answerModelProvider: "doubao-pro"
    }
  }, async (event) => {
    streamEvents.push(event);
  });
  const streamedBody = streamEvents
    .filter((event): event is Extract<AiChatStreamEvent, { type: "token" }> => event.type === "token")
    .map((event) => event.content)
    .join("");
  const finalEvent = streamEvents.find(
    (event): event is Extract<AiChatStreamEvent, { type: "final" }> => event.type === "final"
  );

  assert.equal(streamedBody, exactDoubaoMarkdown);
  assert.equal(finalEvent?.content, exactDoubaoMarkdown);
  assert.equal(finalEvent?.data.answer, exactDoubaoMarkdown);
  assert.equal(finalEvent?.data.rawAnswerBeforeFinalizer, exactDoubaoMarkdown);
  assert.equal(finalEvent?.data.customer_answer, "");
  assert.equal(finalEvent?.data.runtime_output, undefined, "原文旁路不得再进入 Runtime V2 正文层。");

  const routeSource = readFileSync("app/api/ai/chat/ask/route.ts", "utf8");
  const adapterSource = readFileSync("lib/ai-chat/user-agent-ingest-answer.ts", "utf8");
  const askSource = readFileSync("lib/ai-chat/ask.ts", "utf8");

  assert.match(routeSource, /parseUserAnswerModelProvider/);
  assert.match(routeSource, /runUserAgentIngestAnswer/);
  assert.match(routeSource, /strictAnswerModelSelection: true/);
  assert.doesNotMatch(routeSource, /generateRagAnswer|getOrCreateUserSettings|CHAT_PROVIDER_PRIORITY/);
  assert.match(adapterSource, /strictModelAffinity: true/);
  assert.match(adapterSource, /answer: result\.replyMarkdown \|\| ""/);
  assert.doesNotMatch(adapterSource, /enhanceGPTStyle|processAIOutput|normalizeUserChatMarkdown/);
  assert.match(askSource, /answer_output_mode: ingestReplyPassthrough/);
  assert.match(askSource, /options\.strictAnswerModelSelection/);

  console.log("ai-chat user model selection tests passed");
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(restoreEnvironment);
