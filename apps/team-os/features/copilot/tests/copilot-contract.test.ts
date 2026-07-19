import assert from "node:assert/strict";

import { ValidationError } from "@/lib/errors";
import {
  employeeInsights,
  managerInsights,
  ownerInsights
} from "@/apps/team-os/features/copilot/services/insight-engine";
import type {
  EmployeeCopilotSnapshot,
  ManagerCopilotSnapshot,
  OwnerCopilotSnapshot
} from "@/apps/team-os/features/copilot/types";
import {
  parseCopilotAssistantRole,
  parseCopilotChatInput,
  parseCopilotCompanyId,
  parseCopilotInsightSyncInput,
  parseCopilotInsightsQuery
} from "@/apps/team-os/features/copilot/utils/copilot-input";
import {
  availableCopilotRoles,
  copilotTeamIdsForRole
} from "@/apps/team-os/features/copilot/utils/copilot-permissions";

function expectValidationError(run: () => unknown, message: RegExp) {
  assert.throws(run, (error: unknown) => (
    error instanceof ValidationError && message.test(error.message)
  ));
}

assert.deepEqual(
  availableCopilotRoles({
    hasPersonalScope: true,
    hasManagerScope: false,
    hasOwnerScope: false
  }),
  ["EMPLOYEE_ASSISTANT"]
);
assert.deepEqual(
  availableCopilotRoles({
    hasPersonalScope: true,
    hasManagerScope: true,
    hasOwnerScope: true
  }),
  ["EMPLOYEE_ASSISTANT", "MANAGER_ASSISTANT", "OWNER_ASSISTANT"]
);
assert.deepEqual(
  availableCopilotRoles({
    hasPersonalScope: true,
    hasManagerScope: false,
    hasOwnerScope: true
  }),
  ["EMPLOYEE_ASSISTANT", "OWNER_ASSISTANT"],
  "A company owner must not receive the manager assistant without a direct TEAM_MANAGER role."
);
assert.deepEqual(
  availableCopilotRoles({
    hasPersonalScope: false,
    hasManagerScope: false,
    hasOwnerScope: false
  }),
  []
);

const teamScopes = {
  personalTeamIds: ["personal-a", "personal-a"],
  managerTeamIds: ["managed-a", "managed-b"],
  companyTeamIds: ["personal-a", "managed-a", "company-c"]
};
assert.deepEqual(
  copilotTeamIdsForRole(teamScopes, "EMPLOYEE_ASSISTANT"),
  ["personal-a"],
  "Employee assistant must not inherit manager or company-wide teams."
);
assert.deepEqual(
  copilotTeamIdsForRole(teamScopes, "MANAGER_ASSISTANT"),
  ["managed-a", "managed-b"],
  "Manager assistant must remain limited to directly managed teams."
);
assert.deepEqual(
  copilotTeamIdsForRole(teamScopes, "OWNER_ASSISTANT"),
  ["personal-a", "managed-a", "company-c"],
  "Owner assistant may use only the selected company's team scope."
);

assert.equal(parseCopilotAssistantRole("MANAGER_ASSISTANT"), "MANAGER_ASSISTANT");
expectValidationError(
  () => parseCopilotAssistantRole("SUPER_ADMIN"),
  /角色不正确/
);
assert.equal(parseCopilotCompanyId("  company-a  "), "company-a");
assert.equal(parseCopilotCompanyId(""), undefined);
expectValidationError(
  () => parseCopilotCompanyId("x".repeat(121)),
  /企业 ID 格式不正确/
);

assert.deepEqual(
  parseCopilotChatInput({
    assistantRole: "EMPLOYEE_ASSISTANT",
    companyId: " company-a ",
    message: "  今天\u0000 该做什么？  "
  }),
  {
    assistantRole: "EMPLOYEE_ASSISTANT",
    companyId: "company-a",
    message: "今天 该做什么？"
  }
);
expectValidationError(
  () => parseCopilotChatInput(null),
  /JSON 对象/
);
expectValidationError(
  () => parseCopilotChatInput({
    assistantRole: "EMPLOYEE_ASSISTANT",
    message: "正常问题",
    userId: "other-user"
  }),
  /不支持的字段：userId/
);
expectValidationError(
  () => parseCopilotChatInput({
    assistantRole: "EMPLOYEE_ASSISTANT",
    message: "x".repeat(501)
  }),
  /不能超过 500/
);
expectValidationError(
  () => parseCopilotInsightSyncInput({
    assistantRole: "OWNER_ASSISTANT",
    companyId: "company-a",
    targetUserId: "other-user"
  }),
  /不支持的字段：targetUserId/
);
assert.deepEqual(
  parseCopilotInsightsQuery(new URLSearchParams("companyId=company-a")),
  { companyId: "company-a", assistantRole: "EMPLOYEE_ASSISTANT" }
);

const employeeSnapshot: EmployeeCopilotSnapshot = {
  tasks: [
    {
      id: "task-overdue",
      teamId: "personal-a",
      teamName: "销售一组",
      title: "客户回访",
      deadline: "2026-07-12T00:00:00.000Z",
      status: "IN_PROGRESS",
      submittedByCurrentUser: false,
      overdue: true
    },
    {
      id: "task-submitted",
      teamId: "personal-a",
      teamName: "销售一组",
      title: "已提交任务",
      deadline: "2026-07-12T00:00:00.000Z",
      status: "IN_PROGRESS",
      submittedByCurrentUser: true,
      overdue: true
    }
  ],
  customers: [
    {
      id: "customer-risk",
      teamId: "personal-a",
      maskedName: "张**",
      riskLevel: "HIGH",
      daysSinceFollowUp: 1
    },
    {
      id: "customer-healthy",
      teamId: "personal-a",
      maskedName: "李**",
      riskLevel: "LOW",
      daysSinceFollowUp: 1
    }
  ],
  training: [
    {
      id: "training-overdue",
      teamId: "personal-a",
      courseTitle: "销售基础",
      deadline: "2026-07-12T00:00:00.000Z",
      status: "IN_PROGRESS",
      overdue: true
    }
  ],
  growth: {
    score: 59,
    problems: ["跟进节奏慢"],
    suggestions: ["当天完成回访"],
    trainingPlan: "完成客户跟进训练",
    createdAt: "2026-07-13T00:00:00.000Z"
  }
};
const employeeCandidates = employeeInsights(employeeSnapshot);
assert.deepEqual(
  employeeCandidates.map((item) => item.sourceKey),
  [
    "TASK:task-overdue",
    "CRM:customer-risk",
    "TRAINING:training-overdue",
    "AI_COACH:LATEST_LOW_SCORE"
  ]
);
assert.ok(
  employeeCandidates
    .filter((item) => item.teamId)
    .every((item) => item.teamId === "personal-a"),
  "Employee insights must preserve the personal-team scope carried by the snapshot."
);
assert.ok(!employeeCandidates.some((item) => item.sourceKey === "TASK:task-submitted"));
assert.ok(!employeeCandidates.some((item) => item.sourceKey === "CRM:customer-healthy"));

const managerSnapshot: ManagerCopilotSnapshot = {
  taskTotal: 8,
  taskCompleted: 3,
  overdueTaskCount: 3,
  members: [
    {
      userId: "member-a",
      teamId: "managed-a",
      teamName: "销售一组",
      employeeName: "成员 A",
      submissionCount: 0,
      coachScore: 55
    },
    {
      userId: "member-healthy",
      teamId: "managed-b",
      teamName: "销售二组",
      employeeName: "成员 B",
      submissionCount: 2,
      coachScore: 88
    }
  ],
  customerRisks: [
    {
      id: "customer-a",
      teamId: "managed-b",
      maskedName: "王**",
      ownerName: "成员 B",
      riskLevel: "HIGH",
      daysSinceFollowUp: 5
    }
  ],
  openTrainingCount: 4,
  overdueTrainingCount: 2
};
const managerCandidates = managerInsights(managerSnapshot);
assert.deepEqual(
  new Set(managerCandidates.map((item) => item.sourceKey)),
  new Set([
    "TASK:TEAM_OVERDUE",
    "TEAM:managed-a:member-a",
    "CRM:customer-a",
    "TRAINING:TEAM_OVERDUE"
  ])
);
assert.ok(
  managerCandidates
    .filter((item) => item.teamId)
    .every((item) => ["managed-a", "managed-b"].includes(item.teamId!)),
  "Manager insights must remain inside directly managed teams."
);
assert.ok(!managerCandidates.some((item) => item.sourceKey.includes("member-healthy")));

const ownerSnapshot: OwnerCopilotSnapshot = {
  taskCompletionRate: 45,
  employeeAverageScore: 59,
  customerConversionRate: 30,
  trainingCompletionRate: 39,
  aiUsageCount: 120,
  attentionEmployeeCount: 2,
  customerCount: 20,
  riskCustomerCount: 5,
  openTrainingCount: 4,
  trackedAiOutputCount: 100
};
const ownerCandidates = ownerInsights(ownerSnapshot);
assert.deepEqual(
  ownerCandidates.map((item) => item.sourceKey),
  [
    "BUSINESS:TASK_COMPLETION_LOW",
    "BUSINESS:EMPLOYEE_SCORE_LOW",
    "BUSINESS:CRM_RISK",
    "BUSINESS:TRAINING_COMPLETION_LOW"
  ]
);
assert.ok(
  ownerCandidates.every((item) => item.teamId === undefined),
  "Company-wide owner insights must not claim an unrelated team identifier."
);
assert.ok(ownerCandidates.every((item) => item.priority === "HIGH"));

const healthyOwnerSnapshot: OwnerCopilotSnapshot = {
  ...ownerSnapshot,
  taskCompletionRate: 90,
  employeeAverageScore: 85,
  trainingCompletionRate: 95,
  riskCustomerCount: 0
};
assert.deepEqual(ownerInsights(healthyOwnerSnapshot), []);

const cappedEmployeeInsights = employeeInsights({
  tasks: Array.from({ length: 35 }, (_, index) => ({
    id: `task-${index}`,
    teamId: "personal-a",
    teamName: "销售一组",
    title: `任务 ${index}`,
    deadline: "2026-07-12T00:00:00.000Z",
    status: "IN_PROGRESS" as const,
    submittedByCurrentUser: false,
    overdue: true
  })),
  customers: [],
  training: []
});
assert.equal(cappedEmployeeInsights.length, 30, "Insight responses must be capped.");

console.log("AI Team OS Copilot contract tests passed.");
