import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { buildGptIngestMemoryPrompt } from "../lib/enterprise/gpt-ingest-memory";

const longConversationTail = "LONG_CONVERSATION_TAIL_MUST_REACH_PROVIDER";
const memoryTail = "PUBLISHED_MEMORY_TAIL_MUST_REACH_PROVIDER";
const knowledgeTail = "FIXED_KNOWLEDGE_TAIL_MUST_REACH_PROVIDER";
const recentMessageTail = "RECENT_MESSAGE_TAIL_MUST_REACH_PROVIDER";
const recentMessages = Array.from({ length: 12 }, (_, index) => ({
  role: index % 2 === 0 ? "user" as const : "assistant" as const,
  content: index === 0
    ? `${"最近消息完整正文".repeat(100)}\n${recentMessageTail}`
    : `最近一轮消息-${index + 1}`
}));
const prompt = buildGptIngestMemoryPrompt({
  currentInput: "请继续按照当前专家知识回答。",
  currentAgent: {
    agentId: "expert-career",
    agentName: "讲事业导师",
    category: "沟通训练"
  },
  recentMessages,
  contextSummary: `完整历史开头\n${"跨轮上下文".repeat(600)}\n${longConversationTail}`,
  memoryContextText: `已发布记忆开头\n${"长期记忆正文".repeat(500)}\n${memoryTail}`,
  agentLearningInstruction: "所有沟通问题先判断客户所处阶段，再选择对应步骤。",
  usedMemoryIds: ["memory-career-1", "memory-career-1", "memory-career-2"],
  knowledgeContexts: [{
    id: "knowledge-career-1",
    title: "沟通五步骤",
    sourceId: "source-career-course",
    score: 0.96,
    content: `破冰 → 促单跟进 → 讲事业 → 锁定问题 → 成交\n${"固定知识正文".repeat(500)}\n${knowledgeTail}`
  }],
  selectedModelLabel: "DeepSeek-V4-Pro",
  platform: "web",
  syncTarget: ["web"]
});

assert.match(prompt, /## 完整长对话上下文（同一 Agent 跨轮摘要）/);
assert.ok(prompt.includes(recentMessageTail), "Recent message content must not be clipped at the provider prompt boundary.");
assert.match(prompt, /12\. GPT: 最近一轮消息-12/);
assert.ok(prompt.includes(longConversationTail), "The complete cross-turn summary must not be clipped at the provider prompt boundary.");
assert.match(prompt, /## 已发布长期记忆/);
assert.ok(prompt.includes(memoryTail), "Published memory content must reach the provider prompt without being dropped.");
assert.match(prompt, /usedMemoryIds（仅供内部追踪，不得在 replyMarkdown 中展示）: memory-career-1, memory-career-2/);
assert.match(prompt, /## 当前 Agent 学习规则/);
assert.match(prompt, /所有沟通问题先判断客户所处阶段/);
assert.match(prompt, /## 当前 Agent 固定知识库召回/);
assert.match(prompt, /id: knowledge-career-1/);
assert.match(prompt, /sourceId: source-career-course/);
assert.match(prompt, /score: 0\.96/);
assert.ok(prompt.includes(knowledgeTail), "Retrieved fixed-knowledge content must reach the provider prompt without being dropped.");
assert.match(prompt, /不得扩展到其他 Agent 或其他知识库/);

const providerFiles = [
  "lib/enterprise/deepseek-ingest-client.ts",
  "lib/enterprise/openai-ingest-client.ts",
  "lib/enterprise/qwen-client.ts",
  "lib/enterprise/kimi-client.ts"
];
const contextFields = [
  "contextSummary",
  "memoryContextText",
  "agentLearningInstruction",
  "usedMemoryIds",
  "knowledgeContexts"
];

for (const providerFile of providerFiles) {
  const source = readFileSync(path.join(process.cwd(), providerFile), "utf8");

  for (const field of contextFields) {
    assert.ok(
      source.includes(`${field}: input.${field}`),
      `${providerFile} must forward ${field} into the shared provider user prompt.`
    );
  }
}

const openAIProviderSource = readFileSync(
  path.join(process.cwd(), "lib/enterprise/openai-ingest-client.ts"),
  "utf8"
);
assert.match(openAIProviderSource, /function buildCompactGroundingContext/);
assert.match(openAIProviderSource, /compactGroundingContext/);

const ingestClientSource = readFileSync(
  path.join(process.cwd(), "lib/enterprise/ingest-client.ts"),
  "utf8"
);
const ingestRouteSource = readFileSync(
  path.join(process.cwd(), "app/api/admin/kb/ingest/gpt/route.ts"),
  "utf8"
);

assert.match(ingestRouteSource, /contextSummary:\s*input\.contextSummary/);
assert.match(ingestRouteSource, /memoryContextText:\s*publishedMemoryContext\.memoryContextText/);
assert.match(ingestRouteSource, /agentLearningInstruction:\s*publishedMemoryContext\.agentLearningInstruction/);
assert.match(ingestRouteSource, /usedMemoryIds:\s*publishedMemoryContext\.usedMemoryIds/);
assert.doesNotMatch(ingestRouteSource, /memoryContextText:\s*input\.memoryContextText/);

assert.match(ingestClientSource, /buildAdminIngestContextRequestFields\(input\)/);
assert.match(ingestRouteSource, /retrieveAdminIngestGrounding\(\{/);
assert.match(ingestRouteSource, /buildAdminIngestPublishedMemoryContext\(\{/);
assert.match(ingestRouteSource, /knowledgeContexts,/);
assert.match(ingestRouteSource, /readAdminIngestContextRequestFields\(body\)/);
assert.match(
  ingestRouteSource,
  /groundingModelProvider\s*=\s*resolveAdminIngestModelProvider\(\{[\s\S]*?\}\)\.provider/,
  "Strict grounding must use the normalized selected-model provider."
);
assert.match(ingestRouteSource, /shouldUseStrictAdminIngestGrounding\(\{/);
assert.match(ingestRouteSource, /strictKnowledgeMode:\s*strictDoubaoGrounding/);
assert.match(ingestRouteSource, /recentMessages:\s*strictDoubaoGrounding\s*\?\s*input\.recentMessages\s*:\s*undefined/);
assert.match(
  ingestRouteSource,
  /if\s*\(strictDoubaoGrounding\s*&&\s*\(!canonicalAgentScope\s*\|\|\s*!grounding\.applied\)\)/,
  "Doubao requests with missing/conflicting scope or no hit must stop before model invocation."
);
assert.match(ingestRouteSource, /ADMIN_INGEST_STRICT_KNOWLEDGE_REQUIRED/);
assert.match(ingestRouteSource, /adminIngestGrounding:modelInvoked:false/);
assert.match(ingestRouteSource, /retrievedChunkIds:\s*grounding\.retrievedSourceIds\.chunkIds/);
assert.match(ingestRouteSource, /retrievedKnowledgeItemIds:\s*grounding\.retrievedSourceIds\.knowledgeItemIds/);
assert.match(ingestRouteSource, /providedChunkIds:\s*grounding\.sourceIds\.chunkIds/);
assert.match(ingestRouteSource, /providedKnowledgeItemIds:\s*grounding\.sourceIds\.knowledgeItemIds/);
assert.doesNotMatch(ingestRouteSource, /\busedChunkIds\b|\busedKnowledgeItemIds\b/);
assert.doesNotMatch(
  ingestRouteSource,
  /strictDoubaoGrounding[\s\S]{0,240}deepseek-pro/,
  "The Doubao-only grounding gate must not be coupled to DeepSeek."
);

const trainingLogBuilderSource = ingestRouteSource.slice(
  ingestRouteSource.indexOf("function buildStructuredKnowledgeForTrainingLog"),
  ingestRouteSource.indexOf("function toEnterpriseActor")
);
assert.match(trainingLogBuilderSource, /rawStructured\.saveSuggestion === "boolean"/);
assert.match(trainingLogBuilderSource, /readString\(input\.rawResult\.saveRecommendation\)/);
assert.match(trainingLogBuilderSource, /const isDoubaoResult\s*=\s*readString\(input\.rawResult\.provider\)\s*===\s*"doubao"/);
assert.match(trainingLogBuilderSource, /暂缓入库\|需要补充资料/);
assert.match(
  trainingLogBuilderSource,
  /return\s+isDoubaoResult[\s\S]*?\.\.\.directStructured,\s*should_save:\s*doubaoShouldSave[\s\S]*?:\s*directStructured/,
  "Direct structured results must honor Doubao saveSuggestion and pause recommendations."
);
assert.match(
  trainingLogBuilderSource,
  /should_save:\s*isDoubaoResult\s*\?\s*doubaoShouldSave\s*:\s*true/,
  "Fallback training records must not be hard-coded as saveable."
);
assert.match(
  trainingLogBuilderSource,
  /directStructured\?\.should_save \?\? true/,
  "Existing successful provider semantics must remain the fallback when no pause signal exists."
);

console.log("Admin ingest provider context grounding tests passed.");
