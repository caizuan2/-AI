import assert from "node:assert/strict";
import { buildIngestContextPayload } from "../lib/enterprise/ingest-context-builder";
import {
  MAX_INGEST_CONTEXT_CHARS,
  compressConversationContext
} from "../lib/enterprise/ingest-context-compressor";
import type { IngestConversationMessage } from "../lib/enterprise/ingest-conversation-state";

function makeMessage(
  index: number,
  role: "user" | "assistant",
  content = `第 ${index} 条原始对话内容`
): IngestConversationMessage {
  return {
    id: `message-${index}`,
    role,
    content,
    status: "completed",
    conversationId: "conversation-context-test",
    createdAt: index
  };
}

function runLongContextCoverageTest() {
  const messages = Array.from({ length: 20 }, (_, index) => makeMessage(
    index + 1,
    index % 2 === 0 ? "user" : "assistant",
    `唯一标记-${index + 1}-${"内容".repeat(20)}`
  ));
  const first = compressConversationContext(messages, {
    maxMessages: 6,
    keepRecentFullMessages: 4,
    maxChars: 4096
  });
  const second = compressConversationContext(messages, {
    maxMessages: 6,
    keepRecentFullMessages: 4,
    maxChars: 4096
  });

  assert.deepEqual(first.messages, messages.slice(-6).map(({ role, content }) => ({ role, content })));
  assert.equal(first.contextSummary, second.contextSummary, "长上下文压缩必须可重复、确定");
  assert.match(first.contextSummary ?? "", /更早对话长上下文/);
  assert.match(first.contextSummary ?? "", /共14条/);
  assert.match(first.contextSummary ?? "", /唯一标记-1/);
  assert.match(first.contextSummary ?? "", /唯一标记-7/);
  assert.match(first.contextSummary ?? "", /唯一标记-14/);
  assert.equal(first.diagnostics.summarizedMessageCount, 14);
  assert.equal(first.diagnostics.recentMessageCount, 6);
  assert.equal(first.diagnostics.sourceMessageCount, 20);
  assert.ok(first.diagnostics.contextChars <= first.diagnostics.maxContextChars);
  assert.equal(first.diagnostics.capacityExceeded, false);
}

function runPayloadSeparationTest() {
  const prompt = "请给我本轮最终正文";
  const messages = [
    ...Array.from({ length: 14 }, (_, index) => makeMessage(
      index + 1,
      index % 2 === 0 ? "user" : "assistant",
      `历史内容-${index + 1}-${"细节".repeat(40)}`
    )),
    makeMessage(15, "user", prompt)
  ];
  const payload = buildIngestContextPayload({
    conversationId: "conversation-context-test",
    agentId: "expert-career",
    knowledgeBaseId: "kb-business-coach",
    messages,
    prompt,
    maxMessages: 4,
    maxChars: 4096,
    memoryContextText: "训练长期记忆-不可混入对话摘要",
    agentLearningInstruction: "专家学习规则-不可混入对话摘要",
    usedMemoryIds: ["memory-1"]
  });

  assert.equal(payload.messages.filter((message) => message.content === prompt).length, 0);
  assert.match(payload.contextSummary ?? "", /历史内容-1/);
  assert.doesNotMatch(payload.contextSummary ?? "", /训练长期记忆/);
  assert.doesNotMatch(payload.contextSummary ?? "", /专家学习规则/);
  assert.equal(payload.memoryContextText, "训练长期记忆-不可混入对话摘要");
  assert.equal(payload.agentLearningInstruction, "专家学习规则-不可混入对话摘要");
  assert.deepEqual(payload.usedMemoryIds, ["memory-1"]);
  assert.equal(payload.contextDiagnostics.promptChars, prompt.length);
  assert.equal(payload.contextDiagnostics.summarizedMessageCount, 10);
}

function runCapacityAndAtomicRecentMessageTest() {
  const messages = Array.from({ length: 80 }, (_, index) => makeMessage(
    index + 1,
    index % 2 === 0 ? "user" : "assistant",
    `消息-${index + 1}-${"长内容".repeat(100)}`
  ));
  const compressed = compressConversationContext(messages, {
    maxMessages: 12,
    keepRecentFullMessages: 8,
    maxChars: 5000
  });

  assert.ok(compressed.contextSummary);
  assert.equal(compressed.diagnostics.summarizedMessageCount + compressed.diagnostics.recentMessageCount, 80);
  assert.ok(compressed.diagnostics.summaryGroupCount > 0);
  assert.ok(compressed.diagnostics.summaryTruncatedMessageCount > 0);
  assert.ok(compressed.diagnostics.contextChars <= 5000);
  assert.equal(compressed.diagnostics.capacityExceeded, false);
  for (const recentMessage of compressed.messages) {
    const source = messages.find((message) => message.content === recentMessage.content);
    assert.ok(source, "最近消息必须完整保留，不能按字符截断");
  }

  const hardLimit = compressConversationContext(messages, {
    maxMessages: 12,
    maxChars: Number.MAX_SAFE_INTEGER,
    keepRecentFullMessages: 8
  });
  assert.equal(hardLimit.diagnostics.maxContextChars, MAX_INGEST_CONTEXT_CHARS);
}

runLongContextCoverageTest();
runPayloadSeparationTest();
runCapacityAndAtomicRecentMessageTest();

console.log("admin ingest context grounding tests passed");
