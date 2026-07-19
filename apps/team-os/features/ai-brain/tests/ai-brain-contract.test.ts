import assert from "node:assert/strict";

import { ValidationError } from "@/lib/errors";
import {
  AiBrainClientError,
  readAiBrainResponse
} from "@/apps/team-os/features/ai-brain/services/ai-brain-client";
import {
  mineFrequentCustomerQuestions,
  mineFrequentKnowledgeGaps
} from "@/apps/team-os/features/ai-brain/services/question-mining-service";
import {
  parseBrainListQuery,
  parseCandidateQuery,
  parseExtractKnowledgeInput,
  parseKnowledgeFeedbackInput,
  parseReviewKnowledgeInput
} from "@/apps/team-os/features/ai-brain/utils/ai-brain-input";
import {
  normalizeQuestionKey,
  redactBusinessContent,
  stableBrainKey
} from "@/apps/team-os/features/ai-brain/utils/content-safety";
import {
  canExtractKnowledgeSource,
  canGenerateKnowledgeOptimization,
  canReviewKnowledgeCandidate
} from "@/apps/team-os/features/ai-brain/validators/permission-policy";
import {
  assertExcellentScore,
  assertRecentSource,
  assertWorkflowQuality
} from "@/apps/team-os/features/ai-brain/validators/source-quality";
import {
  nextKnowledgeReviewStatus,
  shouldRestorePendingAfterPublishFailure
} from "@/apps/team-os/features/ai-brain/validators/review-state";

function expectValidationError(run: () => unknown, message: RegExp) {
  assert.throws(run, (error: unknown) => (
    error instanceof ValidationError && message.test(error.message)
  ));
}

assert.deepEqual(parseExtractKnowledgeInput({
  companyId: "company-a",
  teamId: "team-a",
  sourceType: "TRAINING",
  sourceId: "evaluation-a"
}), {
  companyId: "company-a",
  teamId: "team-a",
  sourceType: "TRAINING",
  sourceId: "evaluation-a"
});
expectValidationError(
  () => parseExtractKnowledgeInput({ sourceType: "MESSAGE", sourceId: "message-a" }),
  /来源类型/
);
expectValidationError(
  () => parseExtractKnowledgeInput({ sourceType: "CRM", sourceId: "customer-a", userId: "other" }),
  /不支持的字段/
);

assert.equal(parseKnowledgeFeedbackInput({
  companyId: "company-a",
  teamId: "team-a",
  question: "这项政策是什么？",
  feedbackType: "MISSING"
}).answer, "AI 未提供有效答案。");
expectValidationError(
  () => parseKnowledgeFeedbackInput({ question: "问题", feedbackType: "BAD" }),
  /AI 回答/
);
assert.equal(parseReviewKnowledgeInput({
  candidateId: "candidate-a",
  decision: "APPROVE"
}).decision, "APPROVE");
expectValidationError(
  () => parseReviewKnowledgeInput({ candidateId: "candidate-a", decision: "PUBLISH" }),
  /审核结果/
);
assert.deepEqual(parseCandidateQuery(new URLSearchParams("status=PENDING&sourceType=CRM&limit=20")), {
  companyId: undefined,
  status: "PENDING",
  sourceType: "CRM",
  limit: 20
});
expectValidationError(
  () => parseCandidateQuery(new URLSearchParams("limit=20&limit=30")),
  /不能重复/
);
expectValidationError(
  () => parseBrainListQuery(new URLSearchParams("unknown=true")),
  /不支持的字段/
);

const redacted = redactBusinessContent(
  "客户手机号 13800138000，邮箱 person@example.com，详情 https://example.com/a。"
);
assert.doesNotMatch(redacted, /13800138000|person@example\.com|https:\/\//);
assert.match(redacted, /手机号已脱敏/);
assert.doesNotMatch(redactBusinessContent("微信号：sales_helper88"), /sales_helper88/);
assert.doesNotMatch(redactBusinessContent("身份证：110101199001011234"), /110101199001011234/);
assert.doesNotMatch(redactBusinessContent("联系人：张三"), /张三/);
assert.equal(normalizeQuestionKey(" 如何，退款？！ "), "如何退款");
assert.equal(stableBrainKey("a", "b"), stableBrainKey("a", "b"));
assert.notEqual(stableBrainKey("a", "b"), stableBrainKey("b", "a"));

assert.doesNotThrow(() => assertExcellentScore({ score: 90, industryScore: 85, skillScores: [16, 18] }));
expectValidationError(() => assertExcellentScore({ score: 84 }), /85/);
expectValidationError(() => assertExcellentScore({ score: 90, industryScore: 79 }), /80/);
expectValidationError(() => assertExcellentScore({ score: 90, skillScores: [13] }), /14/);
assert.doesNotThrow(() => assertRecentSource(new Date("2026-07-01T00:00:00.000Z"), new Date("2026-07-13T00:00:00.000Z")));
expectValidationError(
  () => assertRecentSource(new Date("2026-01-01T00:00:00.000Z"), new Date("2026-07-13T00:00:00.000Z")),
  /90/
);
assert.doesNotThrow(() => assertWorkflowQuality({ decisionTriggered: true, productionRuns: 5, successfulRuns: 4 }));
expectValidationError(
  () => assertWorkflowQuality({ decisionTriggered: true, productionRuns: 2, successfulRuns: 2 }),
  /3/
);
expectValidationError(
  () => assertWorkflowQuality({ decisionTriggered: true, productionRuns: 5, successfulRuns: 3 }),
  /80%/
);

const owner = { isCompanyOwner: true, managerTeamIds: [], trainerTeamIds: [] };
const manager = { isCompanyOwner: false, managerTeamIds: ["team-a"], trainerTeamIds: [] };
const trainer = { isCompanyOwner: false, managerTeamIds: [], trainerTeamIds: ["team-b"] };
const member = { isCompanyOwner: false, managerTeamIds: [], trainerTeamIds: [] };
assert.equal(canExtractKnowledgeSource(owner, "WORKFLOW"), true);
assert.equal(canExtractKnowledgeSource(manager, "CRM", "team-a"), true);
assert.equal(canExtractKnowledgeSource(manager, "CRM", "team-b"), false);
assert.equal(canExtractKnowledgeSource(trainer, "TRAINING", "team-b"), true);
assert.equal(canExtractKnowledgeSource(trainer, "AI_COACH", "team-b"), false);
assert.equal(canExtractKnowledgeSource(member, "TRAINING", "team-b"), false);
assert.equal(canReviewKnowledgeCandidate(owner), true);
assert.equal(canReviewKnowledgeCandidate(manager), false);
assert.equal(canGenerateKnowledgeOptimization(owner), true);
assert.equal(canGenerateKnowledgeOptimization(manager), false);

assert.equal(nextKnowledgeReviewStatus("PENDING", "CLAIM_APPROVAL"), "REVIEWING");
assert.equal(nextKnowledgeReviewStatus("REVIEWING", "PUBLISH_CONFIRMED"), "APPROVED");
assert.equal(nextKnowledgeReviewStatus("REVIEWING", "PUBLISH_FAILED_SAFE"), "PENDING");
assert.equal(nextKnowledgeReviewStatus("REVIEWING", "PUBLISH_FAILED_UNKNOWN"), "REVIEWING");
assert.equal(nextKnowledgeReviewStatus("PENDING", "REJECT"), "REJECTED");
expectValidationError(
  () => nextKnowledgeReviewStatus("APPROVED", "CLAIM_APPROVAL"),
  /不能从 APPROVED/
);
assert.equal(shouldRestorePendingAfterPublishFailure({ safeToRetry: true, requestDispatched: true }), true);
assert.equal(shouldRestorePendingAfterPublishFailure({ safeToRetry: false, requestDispatched: false }), true);
assert.equal(shouldRestorePendingAfterPublishFailure({ safeToRetry: false, requestDispatched: true }), false);

const mined = mineFrequentKnowledgeGaps("company-a", [
  { id: "1", teamId: "team-a", question: "如何退款？", feedbackType: "MISSING" },
  { id: "2", teamId: "team-a", question: "如何退款!", feedbackType: "BAD" },
  { id: "3", teamId: "team-b", question: "如何退款？", feedbackType: "MISSING" },
  { id: "4", teamId: "team-a", question: "普通好评", feedbackType: "GOOD" }
]);
assert.equal(mined.length, 1);
assert.equal(mined[0]?.teamId, "team-a");
assert.equal(mined[0]?.occurrences, 2);
assert.match(mined[0]?.suggestion ?? "", /知识缺失/);

const customerQuestions = mineFrequentCustomerQuestions("company-a", [
  { id: "f1", teamId: "team-a", content: "产品多久有效？", summary: "" },
  { id: "f2", teamId: "team-a", content: "客户问：产品多久有效？", summary: "" },
  { id: "f3", teamId: "team-a", content: "产品多久有效？", summary: "产品多久有效？" },
  { id: "f4", teamId: "team-b", content: "产品多久有效？", summary: "" }
]);
assert.equal(customerQuestions.length, 1);
assert.equal(customerQuestions[0]?.teamId, "team-a");
assert.equal(customerQuestions[0]?.occurrences, 3);
assert.match(customerQuestions[0]?.suggestion ?? "", /FAQ/);

async function verifyClientResponseContract() {
  const success = await readAiBrainResponse<{ id: string }>(new Response(JSON.stringify({
    ok: true,
    success: true,
    data: { id: "candidate-a" }
  }), { status: 200, headers: { "content-type": "application/json" } }));
  assert.deepEqual(success, { id: "candidate-a" });

  await assert.rejects(
    () => readAiBrainResponse(new Response(JSON.stringify({
      ok: false,
      success: false,
      code: "FORBIDDEN",
      message: "无权访问",
      error: { code: "FORBIDDEN", message: "无权访问" }
    }), { status: 403, headers: { "content-type": "application/json" } })),
    (error: unknown) => error instanceof AiBrainClientError && error.code === "FORBIDDEN"
  );
}

verifyClientResponseContract()
  .then(() => console.log("AI Team OS AI Brain contract tests passed."))
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
