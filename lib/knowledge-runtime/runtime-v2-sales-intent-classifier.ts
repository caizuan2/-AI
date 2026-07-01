import type { RuntimeV2Input, RuntimeV2Source } from "./runtime-v2-types";

export type RuntimeV2SalesIntent =
  | "considering"
  | "price_objection"
  | "effect_doubt"
  | "trust_building"
  | "cycle_choice"
  | "usage_question"
  | "weight_fluctuation"
  | "followup"
  | "wechat_short"
  | "general";

export type RuntimeV2CustomerStage =
  | "cold"
  | "interested"
  | "hesitating"
  | "ready_to_decide"
  | "after_start";

export type RuntimeV2SalesStrategy =
  | "educate"
  | "lower_pressure"
  | "clarify_decision"
  | "build_trust"
  | "guide_next_step"
  | "risk_boundary";

export interface RuntimeV2SalesIntentProfile {
  salesIntent: RuntimeV2SalesIntent;
  customerStage: RuntimeV2CustomerStage;
  recommendedStrategy: RuntimeV2SalesStrategy;
  confidence: number;
  reason: string;
}

function readQuery(input: RuntimeV2Input | string): string {
  return (typeof input === "string" ? input : input.query).trim();
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function hasKnowledgeEvidence(input: RuntimeV2Input, sources?: RuntimeV2Source[]) {
  return Boolean(input.kbId || input.knowledgeBaseId || input.agentId || input.expertId || (sources?.length ?? 0) > 0);
}

export function classifyRuntimeV2SalesIntent(
  input: RuntimeV2Input | string,
  options: { sources?: RuntimeV2Source[] } = {},
): RuntimeV2SalesIntentProfile {
  const query = readQuery(input);
  const hasEvidence = typeof input === "string" ? (options.sources?.length ?? 0) > 0 : hasKnowledgeEvidence(input, options.sources);

  if (hasAny(query, [/33\s*循环|77\s*循环|33.*77|77.*33|哪个(?:更)?适合|怎么选|周期/i])) {
    return {
      salesIntent: "cycle_choice",
      customerStage: "ready_to_decide",
      recommendedStrategy: "clarify_decision",
      confidence: 0.9,
      reason: "用户正在比较周期或选择方案，需要用决策标准推动下一步。",
    };
  }

  if (hasAny(query, [/考虑考虑|再看看|想一想|犹豫|纠结|还没决定|等等再说/])) {
    return {
      salesIntent: "considering",
      customerStage: "hesitating",
      recommendedStrategy: "lower_pressure",
      confidence: 0.88,
      reason: "用户处于犹豫期，需要先降压并找出真实卡点。",
    };
  }

  if (hasAny(query, [/太贵|价格|多少钱|预算|优惠|便宜|划算|值不值/])) {
    return {
      salesIntent: "price_objection",
      customerStage: "hesitating",
      recommendedStrategy: "build_trust",
      confidence: 0.86,
      reason: "用户卡在价格或预算，需要先拆分价值和风险，而不是直接压价。",
    };
  }

  if (hasAny(query, [/有效|效果|靠谱不|真的|会不会|有没有用|担心没效果|怕没效果/])) {
    return {
      salesIntent: "effect_doubt",
      customerStage: "interested",
      recommendedStrategy: hasEvidence ? "build_trust" : "risk_boundary",
      confidence: 0.84,
      reason: "用户关注效果可信度，需要用资料边界和执行条件建立信任。",
    };
  }

  if (hasAny(query, [/信任|案例|证明|凭什么|靠谱吗|安全吗|资质|真实/])) {
    return {
      salesIntent: "trust_building",
      customerStage: "interested",
      recommendedStrategy: "build_trust",
      confidence: 0.82,
      reason: "用户需要信任依据，要先给证据边界再邀请补充情况。",
    };
  }

  if (hasAny(query, [/体重|减脂|控体|掉秤|反弹|平台期|波动|大健康|健康/])) {
    return {
      salesIntent: "weight_fluctuation",
      customerStage: "after_start",
      recommendedStrategy: "risk_boundary",
      confidence: 0.82,
      reason: "用户涉及控体或健康结果，需要强调周期、趋势和合规边界。",
    };
  }

  if (hasAny(query, [/KKS|怎么用|如何使用|用法|流程|步骤|安排/i])) {
    return {
      salesIntent: "usage_question",
      customerStage: "interested",
      recommendedStrategy: "guide_next_step",
      confidence: 0.8,
      reason: "用户在问使用方式，需要先确认基础再给执行路径。",
    };
  }

  if (hasAny(query, [/跟进|回访|下一步|怎么推进|怎么聊|怎么继续|怎么回复/])) {
    return {
      salesIntent: "followup",
      customerStage: "interested",
      recommendedStrategy: "guide_next_step",
      confidence: 0.76,
      reason: "用户需要继续沟通策略，应给出低压力追问和下一步动作。",
    };
  }

  if (hasAny(query, [/微信|短一点|精简|一句话|口语|发给客户/])) {
    return {
      salesIntent: "wechat_short",
      customerStage: "interested",
      recommendedStrategy: "lower_pressure",
      confidence: 0.74,
      reason: "用户需要可直接复制的话术，应压缩表达并保留推进动作。",
    };
  }

  return {
    salesIntent: "general",
    customerStage: hasEvidence ? "interested" : "cold",
    recommendedStrategy: hasEvidence ? "educate" : "guide_next_step",
    confidence: hasEvidence ? 0.62 : 0.56,
    reason: hasEvidence ? "已有知识库或记忆依据，优先结合资料回答。" : "未识别明确成交意图，保持通用业务建议。",
  };
}
