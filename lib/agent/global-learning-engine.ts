import type { UserIntent } from "@/lib/user-intent-detector";
import type {
  ConversionActionWeight,
  ConversionFeedbackAction,
  ConversionFeedbackEvent,
  ConversionFeedbackLoopResult
} from "@/lib/agent/conversion-feedback-loop";

export const GLOBAL_LEARNING_VERSION = "ai-knowledge-os-v9";
export const GLOBAL_LEARNING_BEHAVIOR_STORAGE_KEY = "chat-ui:global-learning:signals";

export type SessionOutcome =
  | "unknown"
  | "engaged"
  | "advanced"
  | "converted"
  | "stalled"
  | "lost";

export interface UserBehaviorSignal {
  intent: UserIntent;
  action_clicked: ConversionFeedbackAction | null;
  conversion_signal: number;
  session_outcome: SessionOutcome;
  time_to_action: number;
  time_on_page: number;
  follow_up_question: boolean;
  source: "current_session" | "conversion_loop" | "client_session_history" | "system_prior";
}

export interface GlobalActionWeight extends ConversionActionWeight {
  previousWeight: number;
  delta: number;
}

export interface GlobalOptimizationResult {
  actionWeights: GlobalActionWeight[];
  optimizedActionOrder: ConversionFeedbackAction[];
  conversionPathOptimization: string[];
  userSegmentModel: {
    intent: UserIntent;
    segment: "educate" | "nurture" | "convert" | "retain" | "recover";
    confidence: number;
  };
  promptStrategyWeights: {
    education: number;
    trust: number;
    proof: number;
    urgency: number;
    handoff: number;
  };
  optimizationStatus: "observe" | "suggest" | "optimize";
}

export interface SystemEvolutionResult {
  score: number;
  versionChange: "V8.1 -> V9";
  globalOptimizationStatus: "observe" | "suggest" | "optimize";
  strategyChanges: string[];
  systemWideOptimizationSignal: string;
}

export interface GlobalLearningLayer {
  version: typeof GLOBAL_LEARNING_VERSION;
  learningMode: "system_wide_session_learning";
  behaviorSignals: UserBehaviorSignal[];
  behaviorSummary: {
    totalSignals: number;
    averageConversionSignal: number;
    highClickAction: ConversionFeedbackAction | null;
    lossRisk: number;
  };
  optimization: GlobalOptimizationResult;
  systemEvolution: SystemEvolutionResult;
  safety: {
    persistence: "client_session_only";
    databaseWrite: false;
    autoExecution: false;
    suggestionOnly: true;
  };
}

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

const intentSegments: Record<UserIntent, GlobalOptimizationResult["userSegmentModel"]["segment"]> = {
  cold_user: "educate",
  warm_user: "nurture",
  hot_user: "convert",
  buyer_user: "retain",
  objection_user: "nurture",
  retention_user: "recover",
  service_user: "retain",
  knowledge_user: "educate"
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function round2(value: number) {
  return Math.round(clamp01(value) * 100) / 100;
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function toNumber(value: unknown, fallback = 0) {
  const numericValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function toAction(value: unknown): ConversionFeedbackAction | null {
  return typeof value === "string" && supportedActions.includes(value as ConversionFeedbackAction)
    ? value as ConversionFeedbackAction
    : null;
}

function classifySessionOutcome(signal: {
  action_clicked?: ConversionFeedbackAction | null;
  conversion_signal: number;
  follow_up_question?: boolean;
  time_on_page?: number;
}): SessionOutcome {
  if (signal.conversion_signal >= 0.78 && (signal.action_clicked === "close_deal" || signal.action_clicked === "handoff_service")) {
    return "converted";
  }

  if (signal.conversion_signal >= 0.65 || signal.follow_up_question) {
    return "advanced";
  }

  if (signal.action_clicked || (signal.time_on_page ?? 0) >= 8) {
    return "engaged";
  }

  if (signal.conversion_signal <= 0.18) {
    return "lost";
  }

  if ((signal.time_on_page ?? 0) <= 2 && !signal.action_clicked) {
    return "stalled";
  }

  return "unknown";
}

function normalizeSignal(value: unknown, fallbackIntent: UserIntent): UserBehaviorSignal | null {
  const record = getRecord(value);
  const intent = typeof record.intent === "string" ? record.intent as UserIntent : fallbackIntent;
  const conversionSignal = clamp01(toNumber(record.conversion_signal, 0.45));
  const actionClicked = toAction(record.action_clicked);
  const timeOnPage = Math.max(0, Math.round(toNumber(record.time_on_page, 0)));
  const timeToAction = Math.max(0, Math.round(toNumber(record.time_to_action, timeOnPage)));
  const rawOutcome = typeof record.session_outcome === "string" ? record.session_outcome : "";
  const sessionOutcome = ["unknown", "engaged", "advanced", "converted", "stalled", "lost"].includes(rawOutcome)
    ? rawOutcome as SessionOutcome
    : classifySessionOutcome({
        action_clicked: actionClicked,
        conversion_signal: conversionSignal,
        follow_up_question: record.follow_up_question === true,
        time_on_page: timeOnPage
      });

  return {
    intent,
    action_clicked: actionClicked,
    conversion_signal: conversionSignal,
    session_outcome: sessionOutcome,
    time_to_action: timeToAction,
    time_on_page: timeOnPage,
    follow_up_question: record.follow_up_question === true,
    source: "client_session_history"
  };
}

export function readClientBehaviorSignals(fallbackIntent: UserIntent): UserBehaviorSignal[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = window.sessionStorage.getItem(GLOBAL_LEARNING_BEHAVIOR_STORAGE_KEY);
    const parsed = rawValue ? JSON.parse(rawValue) : null;

    return Array.isArray(parsed)
      ? parsed
          .map((item) => normalizeSignal(item, fallbackIntent))
          .filter((item): item is UserBehaviorSignal => Boolean(item))
          .slice(-12)
      : [];
  } catch {
    return [];
  }
}

export function collectAllUserBehavior(input: {
  intent: UserIntent;
  feedback?: ConversionFeedbackEvent | null;
  conversionFeedbackLoop?: ConversionFeedbackLoopResult | null;
  opportunityScore?: number;
  dealProbability?: number;
  clientSignals?: UserBehaviorSignal[];
}): UserBehaviorSignal[] {
  const loopFeedback = input.feedback ?? input.conversionFeedbackLoop?.feedback ?? null;
  const conversionSignal = clamp01(
    loopFeedback?.conversion_signal ??
    (((input.opportunityScore ?? 0.45) + (input.dealProbability ?? 0.45)) / 2)
  );
  const currentSignal: UserBehaviorSignal = {
    intent: loopFeedback?.intent ?? input.intent,
    action_clicked: loopFeedback?.action_clicked ?? null,
    conversion_signal: conversionSignal,
    session_outcome: classifySessionOutcome({
      action_clicked: loopFeedback?.action_clicked ?? null,
      conversion_signal: conversionSignal,
      follow_up_question: loopFeedback?.follow_up_question,
      time_on_page: loopFeedback?.time_on_page
    }),
    time_to_action: loopFeedback?.time_on_page ?? 0,
    time_on_page: loopFeedback?.time_on_page ?? 0,
    follow_up_question: loopFeedback?.follow_up_question === true,
    source: "current_session"
  };
  const loopSignals = (input.conversionFeedbackLoop?.orderedActions ?? []).slice(0, 3).map((item): UserBehaviorSignal => ({
    intent: input.intent,
    action_clicked: item.action,
    conversion_signal: round2((item.weight + conversionSignal) / 2),
    session_outcome: classifySessionOutcome({
      action_clicked: item.action,
      conversion_signal: round2((item.weight + conversionSignal) / 2),
      follow_up_question: item.action === "follow_up_question",
      time_on_page: currentSignal.time_on_page
    }),
    time_to_action: currentSignal.time_to_action,
    time_on_page: currentSignal.time_on_page,
    follow_up_question: item.action === "follow_up_question" || currentSignal.follow_up_question,
    source: "conversion_loop"
  }));
  const clientSignals = input.clientSignals ?? readClientBehaviorSignals(input.intent);
  const priorSignal: UserBehaviorSignal = {
    intent: input.intent,
    action_clicked: null,
    conversion_signal: conversionSignal,
    session_outcome: "unknown",
    time_to_action: 0,
    time_on_page: 0,
    follow_up_question: false,
    source: "system_prior"
  };

  return [currentSignal, ...clientSignals, ...loopSignals, priorSignal].slice(-16);
}

function getBaseWeight(action: ConversionFeedbackAction, previousWeights: ConversionActionWeight[]) {
  return previousWeights.find((item) => item.action === action)?.weight ?? 0.36;
}

function getActionSignalScore(action: ConversionFeedbackAction, signals: UserBehaviorSignal[]) {
  const actionSignals = signals.filter((signal) => signal.action_clicked === action);

  if (actionSignals.length === 0) {
    return 0;
  }

  const total = actionSignals.reduce((sum, signal) => {
    const outcomeBoost = signal.session_outcome === "converted"
      ? 0.2
      : signal.session_outcome === "advanced"
        ? 0.14
        : signal.session_outcome === "engaged"
          ? 0.08
          : signal.session_outcome === "lost"
            ? -0.14
            : 0;

    return sum + signal.conversion_signal * 0.26 + outcomeBoost;
  }, 0);

  return total / actionSignals.length;
}

function buildPromptStrategyWeights(signals: UserBehaviorSignal[]): GlobalOptimizationResult["promptStrategyWeights"] {
  const averageSignal = signals.reduce((sum, signal) => sum + signal.conversion_signal, 0) / Math.max(1, signals.length);
  const hasHighIntent = signals.some((signal) => signal.intent === "hot_user" || signal.intent === "buyer_user");
  const hasLossRisk = signals.some((signal) => signal.session_outcome === "lost" || signal.intent === "retention_user");

  return {
    education: round2(hasHighIntent ? 0.38 : 0.68),
    trust: round2(hasLossRisk ? 0.82 : 0.56 + averageSignal * 0.12),
    proof: round2(0.48 + averageSignal * 0.22),
    urgency: round2(hasHighIntent ? 0.78 : 0.28 + averageSignal * 0.2),
    handoff: round2(hasLossRisk || hasHighIntent ? 0.74 : 0.36 + averageSignal * 0.14)
  };
}

export function optimizeStrategyGlobal(input: {
  signals: UserBehaviorSignal[];
  intent: UserIntent;
  previousActionWeights?: ConversionActionWeight[];
}): GlobalOptimizationResult {
  const signals = input.signals.length > 0 ? input.signals : collectAllUserBehavior({ intent: input.intent });
  const weights = supportedActions
    .map((action): GlobalActionWeight => {
      const previousWeight = getBaseWeight(action, input.previousActionWeights ?? []);
      const signalScore = getActionSignalScore(action, signals);
      const segmentBoost = input.intent === "hot_user" && ["close_deal", "handoff_service", "recommend_plan"].includes(action)
        ? 0.1
        : input.intent === "cold_user" && ["educate", "build_trust", "follow_up_question"].includes(action)
          ? 0.08
          : input.intent === "retention_user" && ["retain_user", "handoff_service", "build_trust"].includes(action)
            ? 0.1
            : 0;
      const weight = round2(previousWeight * 0.62 + signalScore + segmentBoost);

      return {
        action,
        previousWeight: round2(previousWeight),
        weight,
        delta: Math.round((weight - previousWeight) * 100) / 100,
        reason: signalScore > 0
          ? "综合当前会话、点击行为和成交信号后上调。"
          : "保留当前意图默认权重，等待更多行为样本。"
      };
    })
    .sort((left, right) => right.weight - left.weight);
  const optimizedActionOrder = weights.slice(0, 6).map((item) => item.action);
  const promptStrategyWeights = buildPromptStrategyWeights(signals);
  const averageSignal = signals.reduce((sum, signal) => sum + signal.conversion_signal, 0) / Math.max(1, signals.length);
  const lossRisk = signals.filter((signal) => signal.session_outcome === "lost" || signal.session_outcome === "stalled").length / Math.max(1, signals.length);

  return {
    actionWeights: weights,
    optimizedActionOrder,
    conversionPathOptimization: [
      optimizedActionOrder.includes("follow_up_question") ? "保留低门槛追问，继续收集需求上下文。" : "减少泛化追问，把回答推进到具体动作。",
      optimizedActionOrder.includes("send_case") ? "案例点击或权重较高：下一轮优先补案例与证据。" : "案例优先级一般：先给标准话术和下一步。",
      lossRisk >= 0.25 ? "流失风险偏高：先修复信任和服务体验，再推进成交。" : "流失风险可控：可以进入方案推荐或人工确认。"
    ],
    userSegmentModel: {
      intent: input.intent,
      segment: intentSegments[input.intent] ?? "educate",
      confidence: round2(Math.max(0.42, averageSignal))
    },
    promptStrategyWeights,
    optimizationStatus: averageSignal >= 0.68 || lossRisk >= 0.25 ? "optimize" : signals.length >= 3 ? "suggest" : "observe"
  };
}

export function evolveSystem(optimization: GlobalOptimizationResult): SystemEvolutionResult {
  const averageWeight = optimization.actionWeights
    .slice(0, 5)
    .reduce((sum, item) => sum + item.weight, 0) / Math.max(1, optimization.actionWeights.slice(0, 5).length);
  const positiveDeltas = optimization.actionWeights.filter((item) => item.delta > 0.04).length;
  const negativeDeltas = optimization.actionWeights.filter((item) => item.delta < -0.04).length;
  const score = round2(averageWeight * 0.74 + positiveDeltas * 0.035 - negativeDeltas * 0.02);
  const strategyChanges = optimization.actionWeights
    .filter((item) => Math.abs(item.delta) >= 0.04)
    .slice(0, 4)
    .map((item) => `${item.action} ${item.delta > 0 ? "上调" : "下调"} ${Math.abs(Math.round(item.delta * 100))}%`);

  return {
    score,
    versionChange: "V8.1 -> V9",
    globalOptimizationStatus: optimization.optimizationStatus,
    strategyChanges: strategyChanges.length > 0 ? strategyChanges : ["保持当前策略，继续收集用户行为。"],
    systemWideOptimizationSignal: optimization.optimizedActionOrder.slice(0, 4).join(" > ")
  };
}

export function buildGlobalLearningLayer(input: {
  intent: UserIntent;
  conversionFeedbackLoop?: ConversionFeedbackLoopResult | null;
  feedback?: ConversionFeedbackEvent | null;
  opportunityScore?: number;
  dealProbability?: number;
  clientSignals?: UserBehaviorSignal[];
}): GlobalLearningLayer {
  const behaviorSignals = collectAllUserBehavior(input);
  const optimization = optimizeStrategyGlobal({
    signals: behaviorSignals,
    intent: input.intent,
    previousActionWeights: input.conversionFeedbackLoop?.orderedActions
  });
  const systemEvolution = evolveSystem(optimization);
  const averageConversionSignal = behaviorSignals.reduce((sum, signal) => sum + signal.conversion_signal, 0) / Math.max(1, behaviorSignals.length);
  const highClickAction = optimization.actionWeights[0]?.action ?? null;
  const lossRisk = behaviorSignals.filter((signal) => signal.session_outcome === "lost" || signal.session_outcome === "stalled").length / Math.max(1, behaviorSignals.length);

  return {
    version: GLOBAL_LEARNING_VERSION,
    learningMode: "system_wide_session_learning",
    behaviorSignals,
    behaviorSummary: {
      totalSignals: behaviorSignals.length,
      averageConversionSignal: round2(averageConversionSignal),
      highClickAction,
      lossRisk: round2(lossRisk)
    },
    optimization,
    systemEvolution,
    safety: {
      persistence: "client_session_only",
      databaseWrite: false,
      autoExecution: false,
      suggestionOnly: true
    }
  };
}

export function buildGlobalLearningPrompt(layer: GlobalLearningLayer) {
  const weights = layer.optimization.actionWeights.slice(0, 5)
    .map((item) => `- ${item.action}：${Math.round(item.weight * 100)}%（变化 ${item.delta >= 0 ? "+" : ""}${Math.round(item.delta * 100)}%）`);

  return [
    "[GLOBAL_LEARNING_ENGINE_V9]",
    `版本变化：${layer.systemEvolution.versionChange}`,
    `系统进化分：${Math.round(layer.systemEvolution.score * 100)}%`,
    `全局优化状态：${layer.systemEvolution.globalOptimizationStatus}`,
    `行为信号数：${layer.behaviorSummary.totalSignals}`,
    `平均成交信号：${Math.round(layer.behaviorSummary.averageConversionSignal * 100)}%`,
    `高点击动作：${layer.behaviorSummary.highClickAction ?? "none"}`,
    "",
    "全局ACTION权重：",
    ...weights,
    "",
    "成交路径优化：",
    ...layer.optimization.conversionPathOptimization.map((item) => `- ${item}`),
    "",
    "系统策略变化：",
    ...layer.systemEvolution.strategyChanges.map((item) => `- ${item}`),
    "",
    "安全边界：",
    "- V9 只输出全局学习建议，不写数据库，不自动成交，不自动修改知识库。"
  ].join("\n");
}
