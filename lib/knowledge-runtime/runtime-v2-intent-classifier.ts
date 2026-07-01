import type { RuntimeV2Input, RuntimeV2OutputMode } from "./runtime-v2-types";

export type RuntimeV2Intent =
  | "comparison_table"
  | "customer_reply"
  | "objection_handling"
  | "sop"
  | "faq"
  | "analysis"
  | "summary"
  | "sales_followup"
  | "wechat_short"
  | "usage_guide"
  | "general";

export interface RuntimeV2IntentProfile {
  intent: RuntimeV2Intent;
  outputMode: RuntimeV2OutputMode;
  requiresTable: boolean;
  requiresCustomerCopy: boolean;
  requiresSources: boolean;
  wantsShortWechat: boolean;
  reason: string;
}

function normalizeQuery(input: RuntimeV2Input | string): string {
  return (typeof input === "string" ? input : input.query)
    .replace(/\s+/g, "")
    .trim();
}

function fromMode(mode?: RuntimeV2OutputMode): Partial<RuntimeV2IntentProfile> {
  if (mode === "customer_reply") {
    return {
      intent: "customer_reply",
      outputMode: "customer_reply",
      requiresCustomerCopy: true,
      reason: "manual customer reply mode",
    };
  }

  if (mode === "sales_followup" || mode === "sales_closing") {
    return {
      intent: "sales_followup",
      outputMode: mode,
      requiresCustomerCopy: true,
      reason: "manual sales mode",
    };
  }

  if (mode === "sop") {
    return {
      intent: "sop",
      outputMode: "sop",
      reason: "manual sop mode",
    };
  }

  if (mode === "faq") {
    return {
      intent: "faq",
      outputMode: "faq",
      reason: "manual faq mode",
    };
  }

  if (mode === "analysis" || mode === "explain") {
    return {
      intent: "analysis",
      outputMode: mode,
      reason: "manual analysis mode",
    };
  }

  return {};
}

export function classifyRuntimeV2UserIntent(input: RuntimeV2Input | string): RuntimeV2IntentProfile {
  const query = normalizeQuery(input);
  const modeHint = typeof input === "string" ? undefined : input.outputMode;
  const base = fromMode(modeHint);

  if (/微信版|短一点|简短|精简|更短/.test(query)) {
    return {
      intent: "wechat_short",
      outputMode: "customer_reply",
      requiresTable: false,
      requiresCustomerCopy: true,
      requiresSources: true,
      wantsShortWechat: true,
      reason: "short wechat rewrite",
    };
  }

  if (/对比表|对比|区别|差异|33循环|77循环/.test(query)) {
    return {
      intent: "comparison_table",
      outputMode: "analysis",
      requiresTable: true,
      requiresCustomerCopy: true,
      requiresSources: true,
      wantsShortWechat: false,
      reason: "comparison request",
    };
  }

  if (/怎么回复|客户说|发客户|话术|复制给客户|怎么跟.*讲/.test(query)) {
    return {
      intent: /太贵|考虑|犹豫|贵|不想|拒绝/.test(query) ? "objection_handling" : "customer_reply",
      outputMode: "customer_reply",
      requiresTable: false,
      requiresCustomerCopy: true,
      requiresSources: true,
      wantsShortWechat: false,
      reason: "customer communication request",
    };
  }

  if (/SOP|流程|步骤|怎么操作|怎么使用|使用方式|怎么用/.test(query)) {
    return {
      intent: "usage_guide",
      outputMode: "sop",
      requiresTable: false,
      requiresCustomerCopy: true,
      requiresSources: true,
      wantsShortWechat: false,
      reason: "usage or procedure request",
    };
  }

  if (/为什么|原理|原因|分析|波动|怎么回事/.test(query)) {
    return {
      intent: "analysis",
      outputMode: "analysis",
      requiresTable: false,
      requiresCustomerCopy: true,
      requiresSources: true,
      wantsShortWechat: false,
      reason: "analysis request",
    };
  }

  if (/总结|整理|归纳/.test(query)) {
    return {
      intent: "summary",
      outputMode: "analysis",
      requiresTable: false,
      requiresCustomerCopy: false,
      requiresSources: true,
      wantsShortWechat: false,
      reason: "summary request",
    };
  }

  return {
    intent: base.intent ?? "general",
    outputMode: base.outputMode ?? modeHint ?? "auto",
    requiresTable: Boolean(base.requiresTable),
    requiresCustomerCopy: base.requiresCustomerCopy ?? false,
    requiresSources: base.requiresSources ?? true,
    wantsShortWechat: base.wantsShortWechat ?? false,
    reason: base.reason ?? "general request",
  };
}
