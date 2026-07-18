import { classifyRuntimeV2CustomerStage } from "./runtime-v2-customer-stage-classifier";
import { buildRuntimeV2ClosingPath } from "./runtime-v2-closing-path-policy";
import { detectRuntimeV2DealSignals } from "./runtime-v2-deal-signal-detector";
import { buildRuntimeV2FollowupSequence } from "./runtime-v2-followup-sequence-planner";
import { buildRuntimeV2NextQuestion } from "./runtime-v2-next-question-policy";
import { guardRuntimeV2SalesLoopPlan } from "./runtime-v2-no-harassment-guard";
import type {
  RuntimeV2BranchReply,
  RuntimeV2SalesCustomerStage,
  RuntimeV2SalesLoopPlan,
} from "./runtime-v2-sales-loop-types";
import type { RuntimeV2Input, RuntimeV2Memory, RuntimeV2MemoryTraceItem, RuntimeV2Source } from "./runtime-v2-types";

export interface RuntimeV2SalesLoopInput {
  scope: RuntimeV2Input;
  sources?: RuntimeV2Source[];
  memories?: RuntimeV2Memory[];
  memoryTrace?: RuntimeV2MemoryTraceItem[];
}

function buildNextCustomerMessage(nextQuestion: string, customerStage: RuntimeV2SalesCustomerStage) {
  if (customerStage === "price_sensitive") {
    return [
      "理解的，价格确实要认真考虑，我不想催您仓促决定。",
      `我先确认一下：${nextQuestion}`,
      "确认后我再帮您判断是预算压力，还是担心不适合自己，这样再决定会更稳。",
    ].join("\n");
  }

  if (customerStage === "effect_doubt") {
    return [
      "担心效果很正常，先不急着承诺结果。",
      `我先确认一下：${nextQuestion}`,
      "我会根据您的目标和基础情况，帮您判断适不适合，以及需要注意哪些边界。",
    ].join("\n");
  }

  if (customerStage === "after_start") {
    return [
      "先别急着判断没用，体重短期波动常见会受水分、盐分、作息、排便和前一两天饮食节奏影响。",
      `我先确认一下：${nextQuestion}`,
      "您把最近 3 天饮食、作息、排便和体重记录发我，我先帮您复盘，再看要不要调整节奏。",
    ].join("\n");
  }

  if (customerStage === "ready_to_decide") {
    return [
      "可以，我们先把开始前最关键的信息对齐，避免一上来就套固定方案。",
      `我先确认一下：${nextQuestion}`,
      "确认后我再给您一个更适合当前基础的下一步安排。",
    ].join("\n");
  }

  if (customerStage === "inactive") {
    return [
      "先不连续追问，避免给客户压力。",
      `可以低频发一句：${nextQuestion}`,
      "如果客户还是没回复，就先暂停，等对方重新表达兴趣后再继续承接。",
    ].join("\n");
  }

  return [
    "可以的，我先不直接给您固定方案。",
    `我先确认一下：${nextQuestion}`,
    "确认后我再帮您整理一个简单、稳妥、方便执行的下一步。",
  ].join("\n");
}

function buildBranchReplies(nextQuestion: string): RuntimeV2BranchReply[] {
  return [
    {
      when: "客户继续追问细节",
      reply: `我可以继续细化，但先确认一个关键点：${nextQuestion}`,
      nextQuestion,
    },
    {
      when: "客户说再考虑",
      reply: "可以，您不用急着定。我先帮您把最担心的点讲清楚，您再判断也不迟。",
      nextQuestion: "您现在最担心的是价格、效果，还是时间安排？",
    },
    {
      when: "客户没有回复",
      reply: "先不连续追问，隔一段时间用一句轻提醒即可。",
      nextQuestion: "您要是方便，回我一个最在意的点就行。",
    },
  ];
}

function averageConfidence(signals: RuntimeV2SalesLoopPlan["dealSignals"]) {
  if (signals.length === 0) return 0.5;
  return Math.round((signals.reduce((sum, signal) => sum + signal.confidence, 0) / signals.length) * 100) / 100;
}

export function buildRuntimeV2SalesLoop(input: RuntimeV2SalesLoopInput): RuntimeV2SalesLoopPlan {
  const sources = input.sources ?? [];
  const dealSignals = detectRuntimeV2DealSignals(input.scope, sources);
  const stage = classifyRuntimeV2CustomerStage({
    scope: input.scope,
    dealSignals,
    sources,
  });
  const nextQuestion = buildRuntimeV2NextQuestion({
    scope: input.scope,
    customerStage: stage.stage,
    dealSignals,
  });
  const followupSequence = buildRuntimeV2FollowupSequence({
    customerStage: stage.stage,
    dealSignals,
    nextQuestion,
  });
  const closingPath = buildRuntimeV2ClosingPath({
    customerStage: stage.stage,
    dealSignals,
    nextQuestion,
  });
  const plan: RuntimeV2SalesLoopPlan = {
    customerStage: stage.stage,
    stageReason: stage.reason,
    dealSignals,
    primaryDealSignal: dealSignals[0],
    confidence: averageConfidence(dealSignals),
    nextQuestion,
    nextCustomerMessage: buildNextCustomerMessage(nextQuestion, stage.stage),
    followupSequence,
    branchReplies: buildBranchReplies(nextQuestion),
    stopRules: [
      "客户明确拒绝时停止推进。",
      "客户未回复时不连续追问。",
      "信息不足时先问一个关键问题，不直接给绝对方案。",
    ],
    closingPath,
  };

  return guardRuntimeV2SalesLoopPlan(plan);
}
