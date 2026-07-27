import assert from "node:assert/strict";

import { ValidationError } from "@/lib/errors";
import {
  parseCreateConversationInput,
  parseCreateIntegrationInput,
  parseCreateSalesTargetInput,
  parseOperationsListInput
} from "@/apps/team-os/features/crm/operations/input";
import { inspectConversationDeterministically } from "@/apps/team-os/features/crm/operations/quality-inspection";

function expectValidation(run: () => unknown, pattern: RegExp) {
  assert.throws(run, (error: unknown) => (
    error instanceof ValidationError && pattern.test(error.message)
  ));
}

const conversation = parseCreateConversationInput({
  customerId: "customer-a",
  channel: "PHONE",
  direction: "OUTBOUND",
  title: "首次需求访谈",
  transcript: "您目前最需要解决什么问题？下一步我明天发送报价方案。",
  startedAt: "2026-07-27T02:00:00.000Z",
  durationSeconds: 180,
  mediaUrls: ["https://media.example.com/call-a.mp3"],
  consentConfirmed: true
});
assert.equal(conversation.channel, "PHONE");
assert.equal(conversation.consentConfirmed, true);
assert.equal(conversation.durationSeconds, 180);

expectValidation(() => parseCreateConversationInput({
  customerId: "customer-a",
  channel: "PHONE",
  title: "未授权录音",
  consentConfirmed: false
}), /必须确认/);

expectValidation(() => parseCreateConversationInput({
  companyId: "company-from-browser",
  customerId: "customer-a",
  channel: "PHONE",
  title: "越权企业",
  consentConfirmed: true
}), /companyId.*服务端/);

expectValidation(() => parseCreateConversationInput({
  customerId: "customer-a",
  channel: "SMS",
  title: "未知渠道",
  consentConfirmed: true
}), /沟通来源/);

expectValidation(() => parseCreateIntegrationInput({
  channel: "WECHAT_WORK",
  name: "企业微信",
  config: {
    region: "cn",
    credentials: { accessToken: "must-not-be-stored" }
  }
}), /敏感字段/);

assert.deepEqual(parseCreateIntegrationInput({
  channel: "WECHAT_WORK",
  name: "企业微信元数据",
  config: {
    region: "cn",
    organizationLabel: "华东销售"
  }
}), {
  teamId: undefined,
  channel: "WECHAT_WORK",
  name: "企业微信元数据",
  status: "ACTIVE",
  externalTenantId: undefined,
  config: {
    region: "cn",
    organizationLabel: "华东销售"
  }
});

expectValidation(
  () => parseOperationsListInput(new URLSearchParams("companyId=company-from-browser")),
  /companyId.*服务端/
);

const target = parseCreateSalesTargetInput({
  metric: "CALLS",
  periodStart: "2026-07-01",
  periodEnd: "2026-07-31",
  targetValue: "120",
  status: "ACTIVE"
});
assert.equal(target.metric, "CALLS");
assert.equal(target.targetValue, "120");

const inspection = inspectConversationDeterministically({
  content: "",
  transcript: [
    "客户希望解决销售跟进效率问题，采购预算需要进一步确认。",
    "您目前的决策流程是什么？预计什么时候上线？",
    "客户担心价格太贵，我们理解这个顾虑，建议先验证试点方案。",
    "下一步明天发送报价，并在下周安排回访。"
  ].join("\n"),
  summary: "",
  durationSeconds: 240
});
assert.ok(inspection.score >= 60);
assert.equal(inspection.validCall, true);
assert.ok(inspection.needs.length > 0);
assert.ok(inspection.objections.length > 0);
assert.ok(inspection.priceRequests.length > 0);
assert.equal(inspection.sensitiveWords.length, 0);

const unsafeInspection = inspectConversationDeterministically({
  content: "我们保证效果，百分百成功，可以私下转账。",
  transcript: "",
  summary: "",
  durationSeconds: 20
});
assert.ok(unsafeInspection.sensitiveWords.length >= 2);
assert.ok(unsafeInspection.issues.some((issue) => issue.code === "SENSITIVE_WORDS"));
assert.equal(unsafeInspection.validCall, false);

console.log("AI Team OS CRM operations input contract tests passed.");
