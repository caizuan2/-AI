import assert from "node:assert/strict";
import { runDeepSeekAdminIngest } from "../lib/enterprise/deepseek-ingest-client";

const originalFetch = globalThis.fetch;
const originalEnv = {
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL,
  DEEPSEEK_PRO_MODEL: process.env.DEEPSEEK_PRO_MODEL
};
let capturedUrl = "";
let capturedBody: Record<string, unknown> | null = null;

async function main() {
  process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
  process.env.DEEPSEEK_BASE_URL = "https://deepseek.test.invalid/v1";
  process.env.DEEPSEEK_PRO_MODEL = "deepseek-v4-pro";
  globalThis.fetch = async (input, init) => {
    capturedUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    capturedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    const replyMarkdown = Array.from({ length: 20 }, () => (
      "核心建议是先理解当前问题，再结合已确认的上下文给出清晰、自然、可以执行的回答。"
    )).join("");

    return new Response(JSON.stringify({
      id: "deepseek-context-test",
      model: "deepseek-v4-pro",
      created: 1_700_000_000,
      choices: [{
        message: {
          role: "assistant",
          content: JSON.stringify({ replyMarkdown })
        }
      }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 100,
        total_tokens: 200
      }
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  await runDeepSeekAdminIngest({
    input: "请回答这个问题",
    source: "admin_ingest",
    agentId: "expert-career",
    agentName: "讲事业导师",
    category: "沟通训练",
    contextSummary: "LONG_CONTEXT_SENTINEL",
    memoryContextText: "PUBLISHED_MEMORY_SENTINEL",
    agentLearningInstruction: "AGENT_LEARNING_SENTINEL",
    usedMemoryIds: ["memory-career-1"],
    knowledgeContexts: [{
      id: "knowledge-career-1",
      title: "沟通五步骤",
      content: "FIXED_KNOWLEDGE_SENTINEL",
      sourceId: "chunk-career-1",
      score: 0.95
    }],
    selectedModelLabel: "DeepSeek-V4-Pro",
    preferredModel: "deepseek-v4-pro",
    platform: "web",
    syncTarget: ["web"],
    requestId: "deepseek-context-test"
  });

  assert.equal(capturedUrl, "https://deepseek.test.invalid/v1/chat/completions");
  assert.ok(capturedBody);
  const messages = capturedBody.messages as Array<{ role?: unknown; content?: unknown }>;
  const userPrompt = messages.find((message) => message.role === "user")?.content;

  assert.equal(typeof userPrompt, "string");
  assert.match(userPrompt as string, /LONG_CONTEXT_SENTINEL/);
  assert.match(userPrompt as string, /PUBLISHED_MEMORY_SENTINEL/);
  assert.match(userPrompt as string, /AGENT_LEARNING_SENTINEL/);
  assert.match(userPrompt as string, /FIXED_KNOWLEDGE_SENTINEL/);
  assert.match(userPrompt as string, /memory-career-1/);

  console.log("admin ingest DeepSeek request context tests passed");
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
