import type { RuntimeV2Input, RuntimeV2Source } from "./runtime-v2-types";
import type { RuntimeV2DealSignal } from "./runtime-v2-sales-loop-types";

interface SignalRule {
  key: string;
  label: string;
  patterns: RegExp[];
  evidence: string;
  baseConfidence: number;
}

const SIGNAL_RULES: SignalRule[] = [
  {
    key: "delaying",
    label: "客户在拖延决策",
    patterns: [/考虑考虑|再看看|想一想|等等|纠结|还没决定|回头再说/],
    evidence: "客户没有拒绝，但在延后决定。",
    baseConfidence: 0.82,
  },
  {
    key: "asking_price",
    label: "客户卡在价格/预算",
    patterns: [/太贵|觉得贵|嫌贵|贵不贵|价格|多少钱|预算|优惠|便宜|划算|值不值/],
    evidence: "客户关注价格，需要先拆真实顾虑。",
    baseConfidence: 0.84,
  },
  {
    key: "asking_effect",
    label: "客户担心效果",
    patterns: [/有效|效果|有用|靠谱不|真的|会不会|担心没效果|怕没效果|安全吗/],
    evidence: "客户需要可信依据和适配边界。",
    baseConfidence: 0.8,
  },
  {
    key: "asking_cycle",
    label: "客户在比较方案/周期",
    patterns: [/33\s*循环|77\s*循环|33.*77|77.*33|怎么选|哪个(?:更)?适合|周期/],
    evidence: "客户已经进入方案判断阶段。",
    baseConfidence: 0.88,
  },
  {
    key: "asking_usage",
    label: "客户询问使用方式",
    patterns: [/KKS|怎么用|如何使用|用法|流程|步骤|安排/i],
    evidence: "客户对使用路径有兴趣，需要补充基础信息。",
    baseConfidence: 0.78,
  },
  {
    key: "asking_safety",
    label: "客户需要信任依据",
    patterns: [/案例|证明|凭什么|信任|靠谱吗|真实|资质|安全/],
    evidence: "客户需要先看证据边界，再做判断。",
    baseConfidence: 0.76,
  },
  {
    key: "ready_signal",
    label: "客户接近行动",
    patterns: [/报名|下单|开始|加入|怎么买|怎么付|现在做|马上/],
    evidence: "客户已经接近下一步动作。",
    baseConfidence: 0.86,
  },
  {
    key: "after_start_feedback",
    label: "客户已开始后反馈",
    patterns: [/体重|掉秤|平台期|波动|反弹|执行了|用了|吃了|记录/],
    evidence: "客户可能已经进入执行或复盘阶段。",
    baseConfidence: 0.74,
  },
  {
    key: "silent",
    label: "需要低压力唤醒",
    patterns: [/不回|没回复|沉默|失联|隔天|过几天|回访/],
    evidence: "需要控制跟进频率，避免打扰。",
    baseConfidence: 0.72,
  },
];

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function readText(input: RuntimeV2Input) {
  return [
    input.query,
    ...(input.messages ?? []).slice(-4).map((message) => message.content),
  ].join("\n");
}

export function detectRuntimeV2DealSignals(
  input: RuntimeV2Input,
  sources: RuntimeV2Source[] = [],
): RuntimeV2DealSignal[] {
  const text = readText(input);
  const evidenceBoost = sources.length > 0 ? 0.05 : 0;
  const signals = SIGNAL_RULES
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(text)))
    .map((rule) => ({
      key: rule.key,
      label: rule.label,
      confidence: clamp01(rule.baseConfidence + evidenceBoost),
      evidence: rule.evidence,
    }));

  if (signals.length > 0) {
    return signals.sort((left, right) => right.confidence - left.confidence);
  }

  return [{
    key: sources.length > 0 ? "positive_feedback" : "unknown",
    label: sources.length > 0 ? "客户正在基于知识库咨询" : "客户需要先明确问题",
    confidence: sources.length > 0 ? 0.62 : 0.52,
    evidence: sources.length > 0 ? "当前问题有知识库资料可承接。" : "当前意图较宽，需要先收敛问题。",
  }];
}
