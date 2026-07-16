import assert from "node:assert/strict";

import {
  streamAiChatResult,
  type AiChatStreamEvent,
  type StreamableAiChatResult
} from "../lib/ai-chat/streaming";
import type { FinalizedAnswer } from "../lib/ai-chat/response-finalizer";

function createFinalizedAnswer(overrides: Partial<FinalizedAnswer> = {}): FinalizedAnswer {
  return {
    title: "讲事业导师回答",
    freeformAnswer: "答",
    problemUnderstanding: "已按当前客户阶段理解问题。",
    keyConclusion: "仅依据讲事业导师知识证据回答。",
    suggestedSteps: ["按知识库顺序推进。"],
    customerReply: "固定知识库原话",
    nextAction: "按已验证的知识库流程执行下一步。",
    ...overrides
  };
}

async function collectStreamEvents(result: StreamableAiChatResult) {
  const events: AiChatStreamEvent[] = [];

  await streamAiChatResult(result, async (event) => {
    events.push(event);
  });

  return events;
}

async function collectFinalEvent(result: StreamableAiChatResult) {
  const events = await collectStreamEvents(result);

  const finalEvent = events.find((event): event is Extract<AiChatStreamEvent, { type: "final" }> => (
    event.type === "final"
  ));

  assert.ok(finalEvent, "stream should emit a final event");
  return finalEvent;
}

async function main() {
  const groundedFinalizedAnswer = createFinalizedAnswer();
  const groundedFinal = await collectFinalEvent({
    answer: "答",
    conversation_id: "career-grounded-conversation",
    message_id: "career-grounded-message",
    mode: "deep",
    customer_answer: groundedFinalizedAnswer.customerReply,
    finalized_answer: groundedFinalizedAnswer,
    runtime_input: {
      query: "客户已经认可但还没有行动，怎么办？",
      agentId: "expert-career",
      knowledgeBaseId: "kb-business-coach",
      namespace: "kb-business-coach"
    }
  });
  const groundedFinalized = groundedFinal.data.finalized_answer as FinalizedAnswer;

  assert.equal(groundedFinal.content, "答");
  assert.equal(groundedFinal.data.customerCopy, "固定知识库原话");
  assert.equal(groundedFinal.data.customer_answer, "固定知识库原话");
  assert.equal(groundedFinal.data.nextStep, "按已验证的知识库流程执行下一步。");
  assert.equal(groundedFinalized.freeformAnswer, "答");
  assert.equal(groundedFinalized.customerReply, "固定知识库原话");
  assert.equal(groundedFinalized.nextAction, "按已验证的知识库流程执行下一步。");
  assert.ok(groundedFinal.data.runtime_output, "Runtime V2 metadata should remain available");

  const completeCareerBody = "## 判断\n\n这位客户刚加好友，当前属于第一步破冰。\n\n## 回复思路\n\n先感受客户，再自我介绍和精准共鸣，最后发送资料。";
  const chunkedCareerEvents = await collectStreamEvents({
    answer: completeCareerBody,
    conversation_id: "career-chunked-conversation",
    message_id: "career-chunked-message",
    mode: "deep",
    customer_answer: "固定知识库原话",
    finalized_answer: createFinalizedAnswer({
      freeformAnswer: completeCareerBody
    }),
    runtime_input: {
      query: "刚刚加的好友，我应该怎么破冰呢？",
      agentId: "expert-career",
      knowledgeBaseId: "kb-business-coach",
      namespace: "kb-business-coach"
    }
  });
  const chunkedCareerTokens = chunkedCareerEvents
    .filter((event): event is Extract<AiChatStreamEvent, { type: "token" }> => event.type === "token")
    .map((event) => event.content);

  assert.equal(chunkedCareerTokens.join(""), completeCareerBody);
  assert.ok(chunkedCareerTokens.some((token) => Array.from(token).length > 1));
  assert.ok(chunkedCareerTokens.length < Array.from(completeCareerBody).length);

  const noEvidenceFinalizedAnswer = createFinalizedAnswer({
    freeformAnswer: "知识证据不足。",
    customerReply: "",
    nextAction: "请先补充对应阶段的知识库资料。"
  });
  const noEvidenceFinal = await collectFinalEvent({
    answer: "知识证据不足。",
    conversation_id: "career-no-evidence-conversation",
    message_id: "career-no-evidence-message",
    mode: "deep",
    customer_answer: "",
    finalized_answer: noEvidenceFinalizedAnswer,
    runtime_input: {
      query: "客户问了知识库没有覆盖的问题。",
      agentId: "expert-career",
      knowledgeBaseId: "kb-business-coach",
      namespace: "kb-business-coach"
    }
  });
  const noEvidenceFinalized = noEvidenceFinal.data.finalized_answer as FinalizedAnswer;

  assert.equal(noEvidenceFinal.data.customerCopy, "");
  assert.equal(noEvidenceFinal.data.customer_answer, "");
  assert.equal(noEvidenceFinal.data.nextStep, "请先补充对应阶段的知识库资料。");
  assert.equal(noEvidenceFinalized.customerReply, "");
  assert.equal(noEvidenceFinalized.nextAction, "请先补充对应阶段的知识库资料。");

  const nonCareerFinalizedAnswer = createFinalizedAnswer({
    customerReply: "非讲事业原始话术"
  });
  const nonCareerFinal = await collectFinalEvent({
    answer: "答",
    conversation_id: "non-career-conversation",
    message_id: "non-career-message",
    mode: "deep",
    customer_answer: nonCareerFinalizedAnswer.customerReply,
    finalized_answer: nonCareerFinalizedAnswer,
    runtime_input: {
      query: "大健康问题",
      agentId: "expert-health",
      knowledgeBaseId: "kb-health",
      namespace: "kb-health"
    }
  });
  const nonCareerRuntimeOutput = nonCareerFinal.data.runtime_output as { customerCopy?: string };

  assert.equal(nonCareerFinal.data.customerCopy, nonCareerRuntimeOutput.customerCopy);
  assert.equal(
    (nonCareerFinal.data.finalized_answer as FinalizedAnswer).customerReply,
    nonCareerRuntimeOutput.customerCopy
  );

  const nonCareerBody = "大健康专家正文仍按原有逐字流式方式输出。";
  const nonCareerEvents = await collectStreamEvents({
    answer: nonCareerBody,
    conversation_id: "non-career-stream-conversation",
    message_id: "non-career-stream-message",
    mode: "deep",
    customer_answer: "非讲事业原始话术",
    finalized_answer: createFinalizedAnswer({
      freeformAnswer: nonCareerBody,
      customerReply: "非讲事业原始话术"
    }),
    runtime_input: {
      query: "大健康问题",
      agentId: "expert-health",
      knowledgeBaseId: "kb-health",
      namespace: "kb-health"
    }
  });
  const nonCareerTokens = nonCareerEvents
    .filter((event): event is Extract<AiChatStreamEvent, { type: "token" }> => event.type === "token")
    .map((event) => event.content);

  assert.equal(nonCareerTokens.join(""), nonCareerBody);
  assert.equal(nonCareerTokens.length, Array.from(nonCareerBody).length);

  console.log("ai-chat career streaming grounding tests passed");
}

void main();
