import type { CommercialExecutionMetadata, UserIntent } from "@/lib/user-intent-detector";
import {
  buildConversionFeedbackLoop,
  buildConversionFeedbackPrompt,
  buildDefaultConversionFeedbackEvent,
  type ConversionFeedbackEvent,
  type ConversionFeedbackLoopResult
} from "@/lib/agent/conversion-feedback-loop";
import {
  buildGlobalLearningLayer,
  buildGlobalLearningPrompt,
  type GlobalLearningLayer
} from "@/lib/agent/global-learning-engine";

export type AutoSalesAgentState =
  | "cold_user"
  | "warm_user"
  | "hot_user"
  | "buyer_user"
  | "lost_user";

export type AutoSalesAgentLoopStage =
  | "identify"
  | "nurture"
  | "convert"
  | "retain"
  | "follow_up";

export interface AutoSalesAgentPlan {
  version: "ai-knowledge-os-v9";
  state: AutoSalesAgentState;
  sourceIntent: UserIntent;
  loopStage: AutoSalesAgentLoopStage;
  opportunityScore: number;
  dealProbability: number;
  primaryObjective: string;
  followUpStrategy: string;
  optimizedTalkingPoints: string[];
  nextBestAction: string;
  followUpQuestion: string;
  learningSignals: string[];
  behaviorTriggers: string[];
  conversionFeedbackLoop: ConversionFeedbackLoopResult;
  globalLearning: GlobalLearningLayer;
  systemEvolutionScore: number;
  systemWideOptimizationSignal: string;
  guardrails: string[];
}

const DEFAULT_AGENT_GUARDRAILS = [
  "自动成交 Agent 只生成建议，不自动下单、不自动承诺价格、不自动修改用户数据。",
  "所有成交推进必须以知识库资料、用户真实意图和人工确认边界为准。",
  "涉及订单、支付、合同、退款、售后或权益承诺时，必须转人工确认。"
];

function clampScore(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function toAgentState(intent: UserIntent): AutoSalesAgentState {
  if (intent === "buyer_user" || intent === "service_user") {
    return "buyer_user";
  }

  if (intent === "hot_user") {
    return "hot_user";
  }

  if (intent === "retention_user") {
    return "lost_user";
  }

  if (intent === "warm_user" || intent === "objection_user") {
    return "warm_user";
  }

  return "cold_user";
}

function toLoopStage(state: AutoSalesAgentState): AutoSalesAgentLoopStage {
  switch (state) {
    case "buyer_user":
      return "retain";
    case "hot_user":
      return "convert";
    case "lost_user":
      return "follow_up";
    case "warm_user":
      return "nurture";
    default:
      return "identify";
  }
}

function getStatePreset(state: AutoSalesAgentState) {
  switch (state) {
    case "buyer_user":
      return {
        opportunityScore: 0.86,
        dealProbability: 0.78,
        primaryObjective: "保障交付体验，识别复购、续费或转介绍机会。",
        followUpStrategy: "先解决当前问题，再确认是否需要升级、复购或持续服务。",
        optimizedTalkingPoints: ["确认已购买状态", "给出交付或售后步骤", "提示人工核对订单", "问题解决后再延伸后续价值"],
        nextBestAction: "确认用户当前属于开通、使用、售后还是升级需求，并转人工核对敏感信息。",
        followUpQuestion: "你现在最需要处理的是开通使用、订单售后，还是后续升级方案？",
        behaviorTriggers: ["点击复制话术", "停留超过 8 秒", "继续追问售后/升级"]
      };
    case "hot_user":
      return {
        opportunityScore: 0.92,
        dealProbability: 0.74,
        primaryObjective: "推动高意向用户进入明确成交路径。",
        followUpStrategy: "快速确认方案、预算和下一步动作，必要时转人工完成交易细节。",
        optimizedTalkingPoints: ["确认购买意向", "推荐主方案", "给出低摩擦下一步", "保留人工确认价格和合同"],
        nextBestAction: "给用户一个明确选择：确认方案、预约沟通、试用开通或人工对接。",
        followUpQuestion: "你希望现在直接确认方案，还是先让工作人员联系你核对细节？",
        behaviorTriggers: ["点击复制成交话术", "连续追问价格/套餐", "回答后立即追问下一步"]
      };
    case "lost_user":
      return {
        opportunityScore: 0.68,
        dealProbability: 0.36,
        primaryObjective: "先挽回不满和流失风险，再恢复继续沟通。",
        followUpStrategy: "承认体验问题，定位原因，给补救动作，并约定人工跟进。",
        optimizedTalkingPoints: ["先接住情绪", "定位不满意原因", "给补救路径", "承诺人工跟进而非 AI 承诺结果"],
        nextBestAction: "让用户选择最不满意的环节，并把问题整理给人工继续处理。",
        followUpQuestion: "你最不满意的是效果、服务响应，还是某个具体使用步骤？",
        behaviorTriggers: ["负向反馈", "停留后无继续提问", "出现退订/投诉/不用关键词"]
      };
    case "warm_user":
      return {
        opportunityScore: 0.72,
        dealProbability: 0.52,
        primaryObjective: "通过案例、对比和方案推荐推动用户进入评估。",
        followUpStrategy: "补齐信任证据，提出诊断问题，把选择收敛到方案路径。",
        optimizedTalkingPoints: ["展示适用场景", "给出对比标准", "用案例降低不确定", "提出下一步诊断问题"],
        nextBestAction: "问用户更看重成本、速度、效果还是风险控制，并推荐对应路径。",
        followUpQuestion: "你更看重成本、速度、效果，还是希望先降低试错风险？",
        behaviorTriggers: ["查看引用来源", "复制答案", "追问案例/流程/区别"]
      };
    default:
      return {
        opportunityScore: 0.42,
        dealProbability: 0.22,
        primaryObjective: "教育用户、建立信任，并引导对方继续补充需求。",
        followUpStrategy: "先讲清价值和适用场景，不急着成交。",
        optimizedTalkingPoints: ["解释是什么", "说明解决什么问题", "给一个简单场景", "邀请补充背景"],
        nextBestAction: "用低门槛问题确认用户场景，再决定是否进入方案推荐。",
        followUpQuestion: "你现在是想先了解功能，还是已经有具体场景想解决？",
        behaviorTriggers: ["首次提问", "无历史上下文", "低置信度意图"]
      };
  }
}

export function buildAutoSalesAgentPlan(
  commercialExecution: CommercialExecutionMetadata,
  feedback?: ConversionFeedbackEvent | null
): AutoSalesAgentPlan {
  const state = toAgentState(commercialExecution.intent);
  const preset = getStatePreset(state);
  const confidenceBoost = (commercialExecution.confidence - 0.5) * 0.18;
  const opportunityScore = clampScore(preset.opportunityScore + confidenceBoost);
  const dealProbability = clampScore(preset.dealProbability + confidenceBoost * 0.8);
  const conversionFeedbackLoop = buildConversionFeedbackLoop({
    intent: commercialExecution.intent,
    feedback: feedback ?? buildDefaultConversionFeedbackEvent({
      intent: commercialExecution.intent,
      opportunityScore,
      dealProbability
    })
  });
  const globalLearning = buildGlobalLearningLayer({
    intent: commercialExecution.intent,
    conversionFeedbackLoop,
    opportunityScore,
    dealProbability
  });

  return {
    version: "ai-knowledge-os-v9",
    state,
    sourceIntent: commercialExecution.intent,
    loopStage: toLoopStage(state),
    opportunityScore,
    dealProbability,
    primaryObjective: preset.primaryObjective,
    followUpStrategy: preset.followUpStrategy,
    optimizedTalkingPoints: preset.optimizedTalkingPoints,
    nextBestAction: preset.nextBestAction,
    followUpQuestion: preset.followUpQuestion,
    learningSignals: [
      "用户是否继续追问",
      "用户是否复制标准回复话术",
      "用户是否停留阅读超过 8 秒",
      "用户是否点击有帮助/没帮助",
      "用户是否从咨询进入成交或售后动作",
      "全局ACTION权重是否发生变化",
      "系统进化分是否提升"
    ],
    behaviorTriggers: preset.behaviorTriggers,
    conversionFeedbackLoop,
    globalLearning,
    systemEvolutionScore: globalLearning.systemEvolution.score,
    systemWideOptimizationSignal: globalLearning.systemEvolution.systemWideOptimizationSignal,
    guardrails: DEFAULT_AGENT_GUARDRAILS
  };
}

export function buildAutoSalesAgentPrompt(plan: AutoSalesAgentPlan) {
  return [
    "[AUTO_SALES_AGENT_V9]",
    `Agent状态：${plan.state}`,
    `闭环阶段：${plan.loopStage}`,
    `成交机会评分：${Math.round(plan.opportunityScore * 100)}%`,
    `成交概率判断：${Math.round(plan.dealProbability * 100)}%`,
    `系统进化分：${Math.round(plan.systemEvolutionScore * 100)}%`,
    `全局优化信号：${plan.systemWideOptimizationSignal}`,
    "",
    "自动成交目标：",
    `- ${plan.primaryObjective}`,
    "",
    "跟进策略：",
    `- ${plan.followUpStrategy}`,
    "",
    "话术优化点：",
    ...plan.optimizedTalkingPoints.map((item) => `- ${item}`),
    "",
    "下一步动作：",
    `- ${plan.nextBestAction}`,
    `- 必须追问：${plan.followUpQuestion}`,
    "",
    "闭环学习信号：",
    ...plan.learningSignals.map((signal) => `- ${signal}`),
    "",
    buildConversionFeedbackPrompt(plan.conversionFeedbackLoop),
    "",
    buildGlobalLearningPrompt(plan.globalLearning),
    "",
    "安全边界：",
    ...plan.guardrails.map((guardrail) => `- ${guardrail}`)
  ].join("\n");
}
