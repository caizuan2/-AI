import type { RuntimeV2AgentPolicy, RuntimeV2Input } from "./runtime-v2-types";

export function buildRuntimeV2AgentPolicies(input: RuntimeV2Input): RuntimeV2AgentPolicy[] {
  const policies: RuntimeV2AgentPolicy[] = [
    {
      id: "business-action-first",
      label: "商业行动优先",
      weight: 0.9,
      instructions: ["先给用户可执行建议，再补充解释。"],
    },
    {
      id: "customer-copy-required",
      label: "客户话术必备",
      weight: 0.85,
      instructions: ["必须产出可直接复制给客户的话术。"],
    },
  ];

  if (input.outputMode === "sales_closing") {
    policies.push({
      id: "closing-next-step",
      label: "成交下一步",
      weight: 0.8,
      instructions: ["给出明确下一步动作，避免泛泛而谈。"],
    });
  }

  if (input.outputMode === "sales_followup") {
    policies.push({
      id: "short-sales-followup",
      label: "简短销售跟进",
      weight: 0.78,
      instructions: ["输出更短、更像微信跟进的话术。"],
    });
  }

  if (input.knowledgeBaseId || input.kbId || input.expertId) {
    policies.push({
      id: "knowledge-grounded",
      label: "知识库优先",
      weight: 0.75,
      instructions: ["优先使用已选择知识库和投喂内容。"],
    });
  }

  return policies;
}

export function buildRuntimeV2AgentPolicy(input: RuntimeV2Input) {
  const policies = buildRuntimeV2AgentPolicies(input);

  return {
    policyText: policies.flatMap((policy) => policy.instructions).join("\n"),
    appliedAgentPolicies: policies.map((policy) => policy.id),
    riskBoundaries: [
      "不夸大医疗、健康、收益效果。",
      "不让策略覆盖知识库事实。"
    ],
    answerStyle: input.outputMode === "sales_followup" ? "short_customer_followup" : "business_execution",
  };
}
