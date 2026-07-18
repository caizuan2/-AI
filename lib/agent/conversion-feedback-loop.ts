import type { UserIntent } from "@/lib/user-intent-detector";

export type ConversionFeedbackAction =
  | "educate"
  | "build_trust"
  | "send_case"
  | "compare_options"
  | "recommend_plan"
  | "close_deal"
  | "handoff_service"
  | "retain_user"
  | "follow_up_question";

export interface ConversionFeedbackEvent {
  intent: UserIntent;
  action_clicked: ConversionFeedbackAction | null;
  time_on_page: number;
  follow_up_question: boolean;
  conversion_signal: number;
}

export interface ConversionActionWeight {
  action: ConversionFeedbackAction;
  weight: number;
  reason: string;
}

export interface ConversionFeedbackLoopResult {
  version: "ai-knowledge-os-v8.1";
  intent: UserIntent;
  learningMode: "local_session_feedback";
  feedback: ConversionFeedbackEvent;
  actionWeights: ConversionActionWeight[];
  orderedActions: ConversionActionWeight[];
  strategyAdjustments: string[];
  nextOutputStrategy: string;
  promptHints: string[];
  safety: {
    persistence: "none";
    execution: "suggestion_only";
    databaseWrite: false;
  };
}

const supportedIntents: UserIntent[] = [
  "cold_user",
  "warm_user",
  "hot_user",
  "buyer_user",
  "objection_user",
  "retention_user",
  "service_user",
  "knowledge_user"
];

const supportedActions: ConversionFeedbackAction[] = [
  "educate",
  "build_trust",
  "send_case",
  "compare_options",
  "recommend_plan",
  "close_deal",
  "handoff_service",
  "retain_user",
  "follow_up_question"
];

const baseActionWeights: Record<UserIntent, Record<ConversionFeedbackAction, number>> = {
  cold_user: {
    educate: 0.9,
    build_trust: 0.82,
    send_case: 0.48,
    compare_options: 0.36,
    recommend_plan: 0.34,
    close_deal: 0.16,
    handoff_service: 0.18,
    retain_user: 0.12,
    follow_up_question: 0.72
  },
  warm_user: {
    educate: 0.48,
    build_trust: 0.66,
    send_case: 0.84,
    compare_options: 0.76,
    recommend_plan: 0.82,
    close_deal: 0.42,
    handoff_service: 0.36,
    retain_user: 0.18,
    follow_up_question: 0.7
  },
  hot_user: {
    educate: 0.28,
    build_trust: 0.52,
    send_case: 0.68,
    compare_options: 0.62,
    recommend_plan: 0.84,
    close_deal: 0.94,
    handoff_service: 0.82,
    retain_user: 0.16,
    follow_up_question: 0.58
  },
  buyer_user: {
    educate: 0.22,
    build_trust: 0.48,
    send_case: 0.42,
    compare_options: 0.34,
    recommend_plan: 0.5,
    close_deal: 0.58,
    handoff_service: 0.9,
    retain_user: 0.74,
    follow_up_question: 0.62
  },
  objection_user: {
    educate: 0.58,
    build_trust: 0.84,
    send_case: 0.7,
    compare_options: 0.88,
    recommend_plan: 0.58,
    close_deal: 0.28,
    handoff_service: 0.36,
    retain_user: 0.18,
    follow_up_question: 0.76
  },
  retention_user: {
    educate: 0.32,
    build_trust: 0.66,
    send_case: 0.3,
    compare_options: 0.28,
    recommend_plan: 0.32,
    close_deal: 0.18,
    handoff_service: 0.86,
    retain_user: 0.94,
    follow_up_question: 0.78
  },
  service_user: {
    educate: 0.46,
    build_trust: 0.62,
    send_case: 0.28,
    compare_options: 0.22,
    recommend_plan: 0.34,
    close_deal: 0.22,
    handoff_service: 0.9,
    retain_user: 0.58,
    follow_up_question: 0.7
  },
  knowledge_user: {
    educate: 0.78,
    build_trust: 0.5,
    send_case: 0.36,
    compare_options: 0.34,
    recommend_plan: 0.28,
    close_deal: 0.14,
    handoff_service: 0.16,
    retain_user: 0.12,
    follow_up_question: 0.58
  }
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value: unknown, fallback = 0) {
  const numericValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function isSupportedIntent(value: string): value is UserIntent {
  return supportedIntents.includes(value as UserIntent);
}

function isSupportedAction(value: string): value is ConversionFeedbackAction {
  return supportedActions.includes(value as ConversionFeedbackAction);
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function getWeightReason(action: ConversionFeedbackAction, feedback: ConversionFeedbackEvent) {
  if (feedback.action_clicked === action) {
    return "用户点击过该类动作，下一轮优先级上调。";
  }

  if (action === "follow_up_question" && feedback.follow_up_question) {
    return "用户对追问链路有响应，继续保持追问推进。";
  }

  if (feedback.conversion_signal >= 0.7 && ["close_deal", "recommend_plan", "handoff_service"].includes(action)) {
    return "成交信号较高，优先推进明确下一步。";
  }

  if (feedback.time_on_page >= 8 && ["send_case", "compare_options", "build_trust"].includes(action)) {
    return "用户停留较久，适合补信任证据和案例。";
  }

  return "基于当前意图的默认行动权重。";
}

function buildStrategyAdjustments(feedback: ConversionFeedbackEvent, orderedActions: ConversionActionWeight[]) {
  const topAction = orderedActions[0]?.action ?? "follow_up_question";
  const adjustments = [
    `下一轮优先动作：${topAction}`,
    feedback.conversion_signal >= 0.7
      ? "成交信号较强：回答需要更明确地给方案、下一步和人工确认入口。"
      : "成交信号未满：先补价值、案例或诊断问题，不强推成交。",
    feedback.follow_up_question
      ? "用户已进入追问链路：继续用一个具体问题推进。"
      : "用户尚未明确追问：回答结尾必须给低门槛追问。",
    feedback.time_on_page >= 8
      ? "用户停留时间较长：可增加案例、对比和风险边界。"
      : "用户停留时间较短：保持输出更直接，先给可复制话术。"
  ];

  return adjustments;
}

export function normalizeConversionFeedbackEvent(
  value: unknown,
  fallbackIntent: UserIntent,
  fallbackSignal = 0.45
): ConversionFeedbackEvent {
  const record = getRecord(value);
  const rawIntent = cleanText(record.intent);
  const rawAction = cleanText(record.action_clicked);

  return {
    intent: isSupportedIntent(rawIntent) ? rawIntent : fallbackIntent,
    action_clicked: isSupportedAction(rawAction) ? rawAction : null,
    time_on_page: Math.max(0, Math.round(toNumber(record.time_on_page, 0))),
    follow_up_question: record.follow_up_question === true,
    conversion_signal: clamp01(toNumber(record.conversion_signal, fallbackSignal))
  };
}

export function buildDefaultConversionFeedbackEvent(input: {
  intent: UserIntent;
  opportunityScore?: number;
  dealProbability?: number;
}): ConversionFeedbackEvent {
  const signal = clamp01(((input.opportunityScore ?? 0.45) + (input.dealProbability ?? 0.45)) / 2);

  return {
    intent: input.intent,
    action_clicked: null,
    time_on_page: 0,
    follow_up_question: false,
    conversion_signal: signal
  };
}

export function buildConversionFeedbackLoop(input: {
  intent: UserIntent;
  feedback?: ConversionFeedbackEvent | null;
}): ConversionFeedbackLoopResult {
  const feedback = input.feedback ?? buildDefaultConversionFeedbackEvent({ intent: input.intent });
  const baseWeights = baseActionWeights[feedback.intent] ?? baseActionWeights.knowledge_user;
  const actionWeights = supportedActions.map((action) => {
    const clickedBoost = feedback.action_clicked === action ? 0.18 : 0;
    const followUpBoost = action === "follow_up_question" && feedback.follow_up_question ? 0.12 : 0;
    const conversionBoost = ["close_deal", "recommend_plan", "handoff_service"].includes(action)
      ? feedback.conversion_signal * 0.08
      : 0;
    const dwellBoost = feedback.time_on_page >= 8 && ["send_case", "compare_options", "build_trust"].includes(action)
      ? 0.08
      : 0;
    const weight = clamp01((baseWeights[action] ?? 0.2) + clickedBoost + followUpBoost + conversionBoost + dwellBoost);

    return {
      action,
      weight,
      reason: getWeightReason(action, feedback)
    };
  });
  const orderedActions = [...actionWeights].sort((left, right) => right.weight - left.weight);
  const strategyAdjustments = buildStrategyAdjustments(feedback, orderedActions);

  return {
    version: "ai-knowledge-os-v8.1",
    intent: feedback.intent,
    learningMode: "local_session_feedback",
    feedback,
    actionWeights,
    orderedActions,
    strategyAdjustments,
    nextOutputStrategy: strategyAdjustments[1] ?? "基于用户反馈调整下一轮输出。",
    promptHints: [
      `优先行动顺序：${orderedActions.slice(0, 4).map((item) => `${item.action}:${Math.round(item.weight * 100)}%`).join(" > ")}`,
      ...strategyAdjustments
    ],
    safety: {
      persistence: "none",
      execution: "suggestion_only",
      databaseWrite: false
    }
  };
}

export function buildConversionFeedbackPrompt(loop: ConversionFeedbackLoopResult) {
  return [
    "[CONVERSION_FEEDBACK_LOOP_V8_1]",
    `学习模式：${loop.learningMode}`,
    `反馈意图：${loop.feedback.intent}`,
    `点击动作：${loop.feedback.action_clicked ?? "none"}`,
    `页面停留：${loop.feedback.time_on_page}s`,
    `是否进入追问：${loop.feedback.follow_up_question ? "yes" : "no"}`,
    `成交信号：${Math.round(loop.feedback.conversion_signal * 100)}%`,
    "",
    "行动权重排序：",
    ...loop.orderedActions.slice(0, 5).map((item) => `- ${item.action}：${Math.round(item.weight * 100)}%，${item.reason}`),
    "",
    "下一轮策略调整：",
    ...loop.strategyAdjustments.map((item) => `- ${item}`),
    "",
    "安全边界：",
    "- 只作为本地会话学习建议，不写数据库，不自动成交，不自动承诺。"
  ].join("\n");
}
