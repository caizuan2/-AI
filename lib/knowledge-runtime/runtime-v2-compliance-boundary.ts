import type { RuntimeV2SalesIntentProfile } from "./runtime-v2-sales-intent-classifier";
import type { RuntimeV2Input } from "./runtime-v2-types";

const REPLACEMENTS: Array<[RegExp, string]> = [
  [/保证(?:有效|瘦|成功|成交)/g, "更容易判断是否适合"],
  [/一定(?:有效|瘦|成功|成交|下降)/g, "更有机会看到稳定反馈"],
  [/百分百(?:有效|成功|成交)/g, "更稳妥"],
  [/快速瘦/g, "稳步调整"],
  [/躺瘦/g, "按反馈调整"],
  [/治疗/g, "调理或管理"],
  [/治愈/g, "改善或管理"],
];

function clean(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function sanitizeRuntimeV2ComplianceText(value: string): string {
  let next = clean(value);

  for (const [pattern, replacement] of REPLACEMENTS) {
    next = next.replace(pattern, replacement);
  }

  return next;
}

export function buildRuntimeV2ComplianceInstruction(input: RuntimeV2Input, profile?: RuntimeV2SalesIntentProfile) {
  return [
    "[Compliance Boundary]",
    "涉及控体、健康、效果、周期选择时，禁止承诺保证、百分百、一定瘦、快速瘦、治疗、治愈。",
    "必须表达：结果取决于客户基础、作息、饮食、执行和周期反馈。",
    profile ? `salesIntent=${profile.salesIntent}; strategy=${profile.recommendedStrategy}` : "",
    `query=${input.query}`,
  ].filter(Boolean).join("\n");
}

export function applyRuntimeV2ComplianceBoundary<
  T extends {
    answer?: string;
    customerCopy?: string;
    nextStep?: string;
    nextAction?: string;
    complianceWarnings?: string[];
  },
>(output: T, input: RuntimeV2Input, profile?: RuntimeV2SalesIntentProfile): T & { complianceWarnings: string[] } {
  const warnings: string[] = [];
  const before = [output.answer, output.customerCopy, output.nextStep, output.nextAction].filter(Boolean).join("\n");
  const next = {
    ...output,
    answer: output.answer ? sanitizeRuntimeV2ComplianceText(output.answer) : output.answer,
    customerCopy: output.customerCopy ? sanitizeRuntimeV2ComplianceText(output.customerCopy) : output.customerCopy,
    nextStep: output.nextStep ? sanitizeRuntimeV2ComplianceText(output.nextStep) : output.nextStep,
    nextAction: output.nextAction ? sanitizeRuntimeV2ComplianceText(output.nextAction) : output.nextAction,
  };
  const after = [next.answer, next.customerCopy, next.nextStep, next.nextAction].filter(Boolean).join("\n");

  if (before !== after) {
    warnings.push("已替换绝对化或医疗化表达。");
  }

  if (
    /(体重|减脂|控体|健康|KKS|33|77)/i.test(input.query) ||
    profile?.salesIntent === "weight_fluctuation" ||
    profile?.salesIntent === "cycle_choice"
  ) {
    warnings.push("健康/控体相关回答已使用边界表达。");
  }

  return {
    ...next,
    complianceWarnings: Array.from(new Set([...(output.complianceWarnings ?? []), ...warnings])),
  };
}
