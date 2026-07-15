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

async function collectFinalEvent(result: StreamableAiChatResult) {
  const events: AiChatStreamEvent[] = [];

  await streamAiChatResult(result, async (event) => {
    events.push(event);
  });

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

  console.log("ai-chat career streaming grounding tests passed");
}

void main();
