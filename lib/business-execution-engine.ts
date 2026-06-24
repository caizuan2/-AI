import type { CommercialExecutionMetadata, UserIntent } from "@/lib/user-intent-detector";
import {
  buildAutoSalesAgentPlan,
  buildAutoSalesAgentPrompt,
  type AutoSalesAgentPlan
} from "@/lib/agent/auto-sales-agent";
import {
  buildGlobalLearningPrompt,
  type GlobalLearningLayer
} from "@/lib/agent/global-learning-engine";
import { buildBusinessOutputEnforcerInstruction } from "@/lib/business-output-enforcer";

export type BusinessExecutionPriority = "low" | "medium" | "high" | "urgent";

export type BusinessExecutionActionType =
  | "educate"
  | "build_trust"
  | "show_case"
  | "recommend_plan"
  | "compare_options"
  | "close_deal"
  | "offer_incentive"
  | "handoff_service"
  | "retain_user"
  | "answer_knowledge";

export interface BusinessExecutionAction {
  type: BusinessExecutionActionType;
  label: string;
  description: string;
  priority: BusinessExecutionPriority;
  copySuggestion: string;
}

export interface BusinessExecutionPlan {
  version: "ai-knowledge-os-v7";
  intent: UserIntent;
  executionGoal: string;
  executionPath: string[];
  primaryAction: BusinessExecutionAction;
  secondaryActions: BusinessExecutionAction[];
  closingScript: string;
  nextBestQuestion: string;
  humanHandoff: {
    required: boolean;
    reason: string;
  };
  optimizedActionOrder: string[];
  globalStrategyLayer: GlobalLearningLayer;
  systemWideOptimizationSignal: string;
  guardrails: string[];
  autoSalesAgent: AutoSalesAgentPlan;
}

interface IntentActionPreset {
  executionGoal: string;
  executionPath: string[];
  primaryAction: BusinessExecutionAction;
  secondaryActions: BusinessExecutionAction[];
  closingScript: string;
  nextBestQuestion: string;
  handoffReason: string;
}

const DEFAULT_GUARDRAILS = [
  "所有成交建议必须以知识库资料和用户真实需求为边界。",
  "不能承诺价格、收益、资格、交付时间等未确认事项。",
  "涉及订单、支付、退款、合同或售后问题时，必须提示人工确认。"
];

const ACTION_PRESETS: Record<UserIntent, IntentActionPreset> = {
  cold_user: {
    executionGoal: "教育用户并建立初步信任，引导对方继续咨询。",
    executionPath: ["解释价值", "降低理解门槛", "给出简单例子", "邀请补充场景"],
    primaryAction: {
      type: "educate",
      label: "教育 + 建立信任",
      description: "先让用户听懂你能解决什么问题，不急着成交。",
      priority: "medium",
      copySuggestion: "我先简单帮你拆一下：这个方案主要解决的是你现在遇到的具体问题。你可以先告诉我你的使用场景，我再按你的情况给你更准确的建议。"
    },
    secondaryActions: [
      {
        type: "build_trust",
        label: "补一个真实场景",
        description: "用一个低风险、容易理解的例子承接用户。",
        priority: "low",
        copySuggestion: "你可以先把现在最困扰你的点告诉我，我会按实际情况说明适不适合，不会直接让你盲目决定。"
      }
    ],
    closingScript: "先不要急着推成交，先把价值讲清楚，再问一个能判断需求的问题。",
    nextBestQuestion: "你现在主要是想先了解功能，还是已经有具体问题想解决？",
    handoffReason: "冷启动用户通常不需要立即转人工，除非用户提出价格、合同或购买问题。"
  },
  warm_user: {
    executionGoal: "通过案例、方案和对比，推动用户从了解进入评估。",
    executionPath: ["确认场景", "展示案例", "推荐方案", "对比取舍"],
    primaryAction: {
      type: "recommend_plan",
      label: "方案推荐",
      description: "把用户问题转成可选择的方案路径。",
      priority: "high",
      copySuggestion: "按你现在的情况，我建议先看两个方向：一个是低成本验证，一个是直接按完整方案推进。你可以告诉我更看重成本、速度还是效果，我再帮你选。"
    },
    secondaryActions: [
      {
        type: "show_case",
        label: "案例展示",
        description: "用案例或知识库依据降低不确定感。",
        priority: "medium",
        copySuggestion: "类似情况一般会先看使用场景和预期结果，再决定用轻量方案还是完整方案。"
      },
      {
        type: "compare_options",
        label: "对比分析",
        description: "帮助用户看清不同选择的利弊。",
        priority: "medium",
        copySuggestion: "如果你更在意稳妥，就选完整方案；如果你想先试效果，可以先从小范围验证开始。"
      }
    ],
    closingScript: "先给用户选择权，再把选择收敛到下一步动作。",
    nextBestQuestion: "你更希望先快速试一下，还是直接按完整方案推进？",
    handoffReason: "用户进入明确方案评估后，可在价格、合同、试用或交付细节阶段转人工。"
  },
  hot_user: {
    executionGoal: "推动高意向用户进入明确成交路径。",
    executionPath: ["确认购买意向", "推荐主方案", "给出成交动作", "保留人工确认"],
    primaryAction: {
      type: "close_deal",
      label: "成交路径",
      description: "把用户引导到下单、预约、开通、试用或人工确认。",
      priority: "urgent",
      copySuggestion: "如果你现在已经确定要推进，我建议我们先确认适合你的方案和下一步操作。确认后我可以帮你转给工作人员继续处理开通或下单细节。"
    },
    secondaryActions: [
      {
        type: "offer_incentive",
        label: "优惠引导",
        description: "只提示人工确认优惠，不在 AI 侧承诺价格。",
        priority: "high",
        copySuggestion: "优惠和最终价格需要工作人员按当前政策确认，我可以先帮你整理需求，方便后续快速对接。"
      },
      {
        type: "handoff_service",
        label: "人工转接",
        description: "高意向用户建议尽快转人工确认订单和交付。",
        priority: "high",
        copySuggestion: "我建议现在转人工确认具体方案、价格和开通步骤，避免你来回沟通。"
      }
    ],
    closingScript: "明确提出下一步，不要只停留在解释。",
    nextBestQuestion: "你希望现在直接确认方案，还是先让工作人员联系你核对细节？",
    handoffReason: "高意向用户已经接近成交，涉及价格、开通、合同或支付时必须人工确认。"
  },
  buyer_user: {
    executionGoal: "服务已成交用户，保障交付并引导复购或转介绍。",
    executionPath: ["确认订单/使用状态", "给交付步骤", "处理售后问题", "引导后续服务"],
    primaryAction: {
      type: "handoff_service",
      label: "交付 / 客服转接",
      description: "已购买用户优先保障交付和售后体验。",
      priority: "urgent",
      copySuggestion: "你已经购买的话，我先帮你确认当前问题属于开通、使用还是售后。涉及订单和售后细节，我建议直接转工作人员帮你核对。"
    },
    secondaryActions: [
      {
        type: "close_deal",
        label: "复购或续费机会",
        description: "先解决问题，再判断是否适合推荐升级或续费。",
        priority: "medium",
        copySuggestion: "等当前问题处理完，如果你还想提升效果，我可以再帮你看看有没有更适合的后续方案。"
      }
    ],
    closingScript: "已购买用户不要重复销售，先交付，再做二次价值延伸。",
    nextBestQuestion: "你现在的问题是开通使用、订单售后，还是想了解后续升级方案？",
    handoffReason: "已购买用户涉及订单、支付、售后、退款和交付细节，建议人工接入。"
  },
  objection_user: {
    executionGoal: "拆解异议并恢复继续沟通的意愿。",
    executionPath: ["接住顾虑", "识别真实异议", "回到价值证据", "给低风险下一步"],
    primaryAction: {
      type: "compare_options",
      label: "异议拆解",
      description: "把反对意见变成可继续沟通的问题。",
      priority: "high",
      copySuggestion: "你觉得贵是正常的，我不建议只看价格。可以先看它能不能解决你的具体问题、能省下什么成本，以及后续服务是否匹配。"
    },
    secondaryActions: [
      {
        type: "build_trust",
        label: "建立信任",
        description: "用边界、依据和案例减少不确定。",
        priority: "medium",
        copySuggestion: "如果你担心效果，我们可以先按你的场景做一次判断，不适合我也会直接告诉你。"
      }
    ],
    closingScript: "不要直接反驳，先承认，再把讨论从价格转成价值和风险。",
    nextBestQuestion: "你觉得贵主要是总价高，还是担心买了以后效果不确定？",
    handoffReason: "若用户要求具体优惠、合同、付款或保障条款，需要人工确认。"
  },
  retention_user: {
    executionGoal: "挽回不满用户，恢复信任并给出补救动作。",
    executionPath: ["承认体验问题", "定位原因", "给补救方案", "约定跟进"],
    primaryAction: {
      type: "retain_user",
      label: "挽回 / 补救",
      description: "优先处理不满和流失风险。",
      priority: "urgent",
      copySuggestion: "抱歉让你有这样的体验。你可以先告诉我具体是哪一步不满意，我先帮你定位原因；如果涉及服务或订单，我建议马上转工作人员跟进。"
    },
    secondaryActions: [
      {
        type: "handoff_service",
        label: "人工跟进",
        description: "不满意用户需要尽快进入人工闭环。",
        priority: "urgent",
        copySuggestion: "这个问题我建议不要让你继续等，我会优先整理情况，方便工作人员直接跟进处理。"
      }
    ],
    closingScript: "先解决情绪和问题，再谈后续保留。",
    nextBestQuestion: "你最不满意的是效果、服务响应，还是使用过程中的某个具体问题？",
    handoffReason: "留存风险高，建议人工介入做补救和跟进。"
  },
  service_user: {
    executionGoal: "快速解决服务问题，减少用户摩擦。",
    executionPath: ["确认现象", "给排查步骤", "判断升级条件", "转人工处理"],
    primaryAction: {
      type: "handoff_service",
      label: "服务处理",
      description: "先排查，再明确何时转人工。",
      priority: "high",
      copySuggestion: "我先帮你按最短路径排查：你现在看到的具体报错是什么？如果涉及账号、订单或权限，我建议直接转工作人员核对。"
    },
    secondaryActions: [
      {
        type: "answer_knowledge",
        label: "知识库排查",
        description: "先用知识库给可执行步骤。",
        priority: "medium",
        copySuggestion: "你可以先按这几步检查，如果仍然不行，我再帮你整理成工单信息。"
      }
    ],
    closingScript: "服务问题要短路径处理，不要让用户反复描述。",
    nextBestQuestion: "你现在是在登录、激活、使用功能，还是上传/同步时遇到问题？",
    handoffReason: "涉及账号、订单、权限和数据时建议人工核对。"
  },
  knowledge_user: {
    executionGoal: "先准确回答知识问题，再判断是否需要转成商业动作。",
    executionPath: ["回答核心问题", "标明依据", "给下一步建议", "必要时转话术"],
    primaryAction: {
      type: "answer_knowledge",
      label: "知识问答",
      description: "保持准确性和边界，避免过度销售。",
      priority: "medium",
      copySuggestion: "我先按知识库资料回答你这个问题；如果你是要发给客户，我可以再帮你改成更自然的话术。"
    },
    secondaryActions: [
      {
        type: "educate",
        label: "转成客户话术",
        description: "把知识答案进一步转成可复制沟通内容。",
        priority: "low",
        copySuggestion: "如果这是客户会问的问题，可以把答案再压缩成一段更适合外发的话。"
      }
    ],
    closingScript: "知识问答先准确，不强行成交。",
    nextBestQuestion: "你是自己理解这个问题，还是准备回复给客户？",
    handoffReason: "知识问答默认不需要转人工，除非涉及订单、价格或承诺。"
  }
};

export function buildBusinessExecutionPlan(
  commercialExecution: CommercialExecutionMetadata
): BusinessExecutionPlan {
  const preset = ACTION_PRESETS[commercialExecution.intent] ?? ACTION_PRESETS.knowledge_user;
  const autoSalesAgent = buildAutoSalesAgentPlan(commercialExecution);
  const optimizedActionOrder = autoSalesAgent.globalLearning.optimization.optimizedActionOrder
    .slice(0, 5);

  return {
    version: "ai-knowledge-os-v7",
    intent: commercialExecution.intent,
    executionGoal: preset.executionGoal,
    executionPath: preset.executionPath,
    primaryAction: preset.primaryAction,
    secondaryActions: preset.secondaryActions,
    closingScript: preset.closingScript,
    nextBestQuestion: preset.nextBestQuestion,
    humanHandoff: {
      required: ["hot_user", "buyer_user", "retention_user"].includes(commercialExecution.intent),
      reason: preset.handoffReason
    },
    optimizedActionOrder,
    globalStrategyLayer: autoSalesAgent.globalLearning,
    systemWideOptimizationSignal: autoSalesAgent.systemWideOptimizationSignal,
    guardrails: DEFAULT_GUARDRAILS,
    autoSalesAgent
  };
}

export function buildBusinessExecutionPrompt(plan: BusinessExecutionPlan) {
  return [
    "[BUSINESS CONTEXT]",
    `用户意图：${plan.intent}`,
    "",
    "商业策略：",
    `- ${plan.primaryAction.label}：${plan.primaryAction.description}`,
    ...plan.executionPath.map((step) => `- ${step}`),
    "",
    "输出要求：",
    "- 必须先基于知识库资料回答用户问题，再结合商业策略给出可执行行动建议。",
    "- 必须包含明确下一步问题或下一步动作。",
    "- 对高意向、购买、异议或留存类用户，禁止只给纯知识回答。",
    "- 需要价格、优惠、订单、支付、合同、退款或售后确认时，必须引导人工确认，不能替用户承诺。",
    "",
    `建议成交话术：${plan.closingScript}`,
    `下一步问题：${plan.nextBestQuestion}`,
    `V9全局优化动作顺序：${plan.optimizedActionOrder.join(" > ")}`,
    `V9系统优化信号：${plan.systemWideOptimizationSignal}`,
    `安全边界：${plan.guardrails.join("；")}`,
    "",
    buildGlobalLearningPrompt(plan.globalStrategyLayer),
    "",
    buildAutoSalesAgentPrompt(plan.autoSalesAgent),
    "",
    buildBusinessOutputEnforcerInstruction(plan.intent)
  ].join("\n");
}
