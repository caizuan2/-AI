import assert from "node:assert/strict";
import {
  assertCrmLeadTransition,
  assertCrmOpportunityStageTransition,
  parseChangeCrmContractStatusInput,
  parseCreateCrmContractInput,
  parseCreateCrmLeadInput,
  parseCreateCrmOpportunityInput,
  parseCreateCrmReceivableInput,
  parseRecordCrmPaymentInput
} from "@/apps/team-os/features/crm/sales/input";
import { parseUpdateCustomerLifecycleInput } from "@/apps/team-os/features/crm/utils/crm-input";

const lead = parseCreateCrmLeadInput({
  teamId: "team-1",
  ownerId: "user-1",
  name: "华东渠道线索",
  companyName: "示例科技",
  phone: "13800000000",
  source: "REFERRAL",
  score: 78,
  estimatedValue: "100000.00",
  tags: ["重点", "渠道"],
  notes: "老客户转介绍"
});
assert.equal(lead.source, "REFERRAL");
assert.deepEqual(lead.tags, ["重点", "渠道"]);
assert.throws(
  () => parseCreateCrmLeadInput({ name: "无联系方式", source: "MANUAL" }),
  /至少填写一项/
);

assert.doesNotThrow(() => assertCrmLeadTransition("ASSIGNED", "CONTACTED"));
assert.throws(() => assertCrmLeadTransition("CONVERTED", "CONTACTED"), /不能从/);

const opportunity = parseCreateCrmOpportunityInput({
  customerId: "customer-1",
  name: "年度采购项目",
  amount: "88000.00",
  probability: 30,
  nextAction: "确认决策链",
  competitors: []
});
assert.equal(opportunity.amount, "88000.00");
assert.doesNotThrow(() => assertCrmOpportunityStageTransition("DISCOVERY", "QUALIFICATION"));
assert.throws(
  () => assertCrmOpportunityStageTransition("DISCOVERY", "WON"),
  /不能从/
);

const contract = parseCreateCrmContractInput({
  customerId: "customer-1",
  opportunityId: "opportunity-1",
  contractNo: "HT-2026-001",
  title: "年度服务合同",
  amount: "88000",
  signedAt: "2026-07-27",
  startDate: "2026-08-01",
  endDate: "2027-07-31",
  fileUrls: ["https://example.com/contracts/HT-2026-001.pdf"],
  notes: ""
});
assert.equal(contract.fileUrls.length, 1);
assert.deepEqual(
  parseChangeCrmContractStatusInput({
    status: "ACTIVE",
    reason: "双方已签署",
    signedAt: "2026-07-27"
  }).status,
  "ACTIVE"
);

const receivable = parseCreateCrmReceivableInput({
  customerId: "customer-1",
  contractId: "contract-1",
  installmentNo: 1,
  amount: "44000",
  dueDate: "2026-08-31",
  notes: ""
});
assert.equal(receivable.installmentNo, 1);
assert.equal(parseRecordCrmPaymentInput({ amount: "1000" }).amount, "1000");
assert.throws(() => parseRecordCrmPaymentInput({ amount: "0" }), /必须大于 0/);

assert.deepEqual(
  parseUpdateCustomerLifecycleInput({
    stage: "CONTACTED",
    level: "MEDIUM",
    reason: "已完成首次有效沟通"
  }),
  {
    stage: "CONTACTED",
    level: "MEDIUM",
    reason: "已完成首次有效沟通"
  }
);
assert.throws(
  () => parseUpdateCustomerLifecycleInput({ reason: "没有目标状态" }),
  /至少修改一项/
);

console.log("AI Team OS CRM sales input contract tests passed.");
