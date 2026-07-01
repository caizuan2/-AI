import type { RuntimeV2DealSignal } from "./runtime-v2-sales-loop-types";
import type { RuntimeV2MemoryTraceItem, RuntimeV2Source } from "./runtime-v2-types";
import type { RuntimeV3GrowthOutput } from "./runtime-v3-sales-learning-types";
import type { RuntimeV4GrowthFlywheelOutput } from "./runtime-v4-growth-types";
import type { RuntimeV5StrategyCandidate, RuntimeV5StrategyType } from "./runtime-v5-strategy-types";

function includesAny(value: string, keys: string[]) {
  const lower = value.toLowerCase();
  return keys.some((key) => lower.includes(key.toLowerCase()));
}

function signalScore(type: RuntimeV5StrategyType, signals: RuntimeV2DealSignal[] = [], segment?: string) {
  const haystack = [
    segment,
    ...signals.flatMap((signal) => [signal.key, signal.label, signal.evidence]),
  ].filter(Boolean).join(" ");

  let score = 0.5;
  if (type === "value_explanation" && includesAny(haystack, ["price", "贵", "预算", "cost"])) score += 0.22;
  if (type === "objection_handling" && includesAny(haystack, ["考虑", "怀疑", "担心", "doubt", "hesitat"])) score += 0.18;
  if (type === "decision_guiding" && includesAny(haystack, ["33", "77", "周期", "选择", "decision"])) score += 0.2;
  if (type === "cycle_choice_guidance" && includesAny(haystack, ["33", "77", "cycle", "周期"])) score += 0.24;
  if (type === "soft_closing" && includesAny(haystack, ["高意向", "开始", "购买", "high_intent"])) score += 0.2;
  if (type === "followup_recovery" && includesAny(haystack, ["沉默", "不回复", "silent"])) score += 0.18;
  if (type === "respectful_stop" && includesAny(haystack, ["拒绝", "停止", "stop", "lost"])) score += 0.25;
  return Math.min(0.95, score);
}

function sourceHint(sources?: RuntimeV2Source[], memoryTrace?: RuntimeV2MemoryTraceItem[]) {
  if ((sources?.length ?? 0) > 0) return "结合已命中的知识库内容，先确认客户状态再输出话术。";
  if ((memoryTrace?.length ?? 0) > 0) return "结合记忆命中内容，避免重复解释已经确认的信息。";
  return "当前知识证据较少，优先用低承诺、低压力的确认式话术。";
}

export function buildRuntimeV5StrategyCandidatePool(input: {
  customerSegment?: RuntimeV3GrowthOutput["customerSegment"] | string | null;
  dealSignals?: RuntimeV2DealSignal[] | null;
  salesGrowthV4?: RuntimeV4GrowthFlywheelOutput | null;
  memoryTrace?: RuntimeV2MemoryTraceItem[] | null;
  sources?: RuntimeV2Source[] | null;
  industryHint?: string | null;
}): RuntimeV5StrategyCandidate[] {
  const segment = input.customerSegment ?? "unknown";
  const dealSignals = input.dealSignals ?? [];
  const sharedReason = sourceHint(input.sources ?? undefined, input.memoryTrace ?? undefined);
  const v4Tone = input.salesGrowthV4?.optimizedRecommendation.recommendedTone;
  const base: Array<Omit<RuntimeV5StrategyCandidate, "score" | "status">> = [
    {
      id: "v5-trust-building",
      type: "trust_building",
      label: "建立信任",
      tone: "温和确认",
      targetSegment: "new_lead / effect_doubt",
      targetSignals: ["效果担心", "安全顾虑", "缺少信任"],
      messagePattern: "先承认顾虑，再解释适用条件，最后邀请补充基础信息。",
      bestFor: "客户担心效果、安全或不了解方案时。",
      avoidWhen: ["客户已经明确要开始", "客户要求停止跟进"],
      complianceRisk: "low",
      expectedOutcome: "降低防备，获得更多背景信息。",
      reason: sharedReason,
    },
    {
      id: "v5-decision-guiding",
      type: "decision_guiding",
      label: "决策引导",
      tone: v4Tone || "decision_guiding",
      targetSegment: "warm_lead / high_intent_lead",
      targetSignals: ["选择困难", "周期选择", "下一步不清晰"],
      messagePattern: "用 2-3 个判断条件帮助客户自己做选择，不替客户强下结论。",
      bestFor: "客户问怎么选、先做什么或下一步怎么走时。",
      avoidWhen: ["客户基础信息不足", "客户还没有表达真实目标"],
      complianceRisk: "low",
      expectedOutcome: "把泛泛咨询推进到可判断的下一步。",
    },
    {
      id: "v5-value-explanation",
      type: "value_explanation",
      label: "价值解释",
      tone: "价值澄清",
      targetSegment: "price_sensitive_lead",
      targetSignals: ["价格顾虑", "预算压力", "想要对比"],
      messagePattern: "先不降价，先解释价值组成、适配边界和不适合人群。",
      bestFor: "客户觉得贵或拿其他方案对比时。",
      avoidWhen: ["客户只要最低价", "客户明确拒绝了解价值"],
      complianceRisk: "medium",
      expectedOutcome: "把价格问题转成价值和适配问题。",
    },
    {
      id: "v5-objection-handling",
      type: "objection_handling",
      label: "异议处理",
      tone: "共情拆解",
      targetSegment: "hesitating_lead / effect_doubt",
      targetSignals: ["考虑考虑", "效果怀疑", "担心执行难"],
      messagePattern: "先接住顾虑，再问清卡点，最后给一个轻量判断动作。",
      bestFor: "客户说考虑、犹豫或担心执行时。",
      avoidWhen: ["客户只是在礼貌拒绝", "客户要求停止"],
      complianceRisk: "low",
      expectedOutcome: "识别真实阻碍，而不是继续强推。",
    },
    {
      id: "v5-soft-closing",
      type: "soft_closing",
      label: "轻成交",
      tone: "低压力推进",
      targetSegment: "high_intent_lead",
      targetSignals: ["问开始", "问周期", "问使用方式"],
      messagePattern: "先确认基础信息，再给可执行下一步，不承诺结果。",
      bestFor: "客户已经问到怎么开始或怎么安排时。",
      avoidWhen: ["客户还在了解阶段", "客户对效果仍有强疑虑"],
      complianceRisk: "medium",
      expectedOutcome: "把高意向推进到具体信息确认。",
    },
    {
      id: "v5-followup-recovery",
      type: "followup_recovery",
      label: "沉默唤回",
      tone: "低打扰",
      targetSegment: "silent_risk",
      targetSignals: ["已读不回", "沉默", "中断对话"],
      messagePattern: "不催促，只给一个可选回复入口和体面退出空间。",
      bestFor: "客户多轮没有回复，但之前有明确兴趣时。",
      avoidWhen: ["客户明确拒绝", "连续多次无回应"],
      complianceRisk: "low",
      expectedOutcome: "降低打扰感，同时保留恢复沟通机会。",
    },
    {
      id: "v5-education-first",
      type: "education_first",
      label: "先教育",
      tone: "科普解释",
      targetSegment: "new_lead / curious_lead",
      targetSignals: ["不了解", "第一次咨询", "问基础概念"],
      messagePattern: "先解释基本原理和适用范围，再问客户当前情况。",
      bestFor: "客户刚进入认知阶段，不适合直接推进成交。",
      avoidWhen: ["客户已经明确要方案", "客户时间很紧只要结论"],
      complianceRisk: "low",
      expectedOutcome: "建立共同语境，减少误解。",
    },
    {
      id: "v5-cycle-choice",
      type: "cycle_choice_guidance",
      label: "周期选择",
      tone: "结构判断",
      targetSegment: "warm_lead / started_customer",
      targetSignals: ["33", "77", "周期选择", "方案选择"],
      messagePattern: "先收集目标、基础和执行强度，再做 33/77 判断。",
      bestFor: "客户问 33/77 或周期怎么选时。",
      avoidWhen: ["客户没有基础信息", "客户要求绝对保证效果"],
      complianceRisk: "medium",
      expectedOutcome: "把周期选择变成条件判断，而不是拍脑袋推荐。",
    },
    {
      id: "v5-execution-support",
      type: "execution_support",
      label: "执行支持",
      tone: "陪跑复盘",
      targetSegment: "started_customer",
      targetSignals: ["已经开始", "执行问题", "复盘"],
      messagePattern: "先确认执行记录，再给复盘方向和下一个动作。",
      bestFor: "客户已经开始执行，问细节或反馈问题时。",
      avoidWhen: ["客户尚未开始", "客户需要专业医疗判断"],
      complianceRisk: "medium",
      expectedOutcome: "帮助客户稳定执行，不夸大结果。",
    },
    {
      id: "v5-respectful-stop",
      type: "respectful_stop",
      label: "尊重停止",
      tone: "体面收口",
      targetSegment: "lost_or_stop / silent_risk",
      targetSignals: ["明确拒绝", "停止跟进", "长期沉默"],
      messagePattern: "表达理解，不继续催促，只保留未来需要时再联系的入口。",
      bestFor: "客户明确拒绝或多次不回复时。",
      avoidWhen: ["客户仍在主动追问", "客户刚表达高意向"],
      complianceRisk: "low",
      expectedOutcome: "保护信任边界，避免骚扰。",
    },
  ];

  return base.map((candidate) => ({
    ...candidate,
    score: signalScore(candidate.type, dealSignals, String(segment)),
    status: "candidate" as const,
    reason: candidate.reason ?? `${candidate.bestFor}${input.industryHint ? ` 行业线索：${input.industryHint}` : ""}`,
  })).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}
