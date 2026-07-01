import { generateABCustomerScripts } from "./runtime-v2-ab-script-generator";
import { scoreDealProbability } from "./runtime-v2-deal-probability-scorer";
import { buildFollowupTiming } from "./runtime-v2-followup-timing-policy";
import { buildMultiTurnSalesPath } from "./runtime-v2-multiturn-sales-path";
import { detectSilenceRisk } from "./runtime-v2-silence-risk-detector";
import type {
  RuntimeV2SalesLoopPlan,
  RuntimeV2SalesLoopV2,
} from "./runtime-v2-sales-loop-types";
import { buildStopPushRules } from "./runtime-v2-stop-push-policy";
import type {
  RuntimeV2Input,
  RuntimeV2Memory,
  RuntimeV2MemoryTraceItem,
  RuntimeV2Source,
} from "./runtime-v2-types";

export interface RuntimeV2SalesLoopV2Input {
  scope: RuntimeV2Input;
  sources?: RuntimeV2Source[];
  memories?: RuntimeV2Memory[];
  memoryTrace?: RuntimeV2MemoryTraceItem[];
  salesIntent?: string | null;
  salesLoopPlan?: RuntimeV2SalesLoopPlan | null;
}

function pickRecommendedAction(output: Omit<RuntimeV2SalesLoopV2, "recommendedAction">) {
  if (output.stopPush.shouldStop) {
    return output.stopPush.respectfulCloseMessage;
  }

  if (output.dealProbability.probability === "high") {
    return "确认开始前两个基础信息，再给下一步安排。";
  }

  if (output.silenceRisk.silenceRisk === "high") {
    return "先用 A 版低压力话术收口，只问一个最在意的问题。";
  }

  if (output.silenceRisk.riskType === "price_pressure") {
    return "先解释价值和适配边界，不直接降价。";
  }

  if (output.silenceRisk.riskType === "effect_doubt") {
    return "先承认顾虑，再给安全边界和轻量验证动作。";
  }

  return output.multiTurnPath.nextBestAction || "先确认客户真实卡点，再给轻量建议。";
}

export function buildSalesLoopV2(input: RuntimeV2SalesLoopV2Input): RuntimeV2SalesLoopV2 {
  const dealProbability = scoreDealProbability({
    scope: input.scope,
    customerStage: input.salesLoopPlan?.customerStage,
    dealSignals: input.salesLoopPlan?.dealSignals,
    salesIntent: input.salesIntent,
    memoryTrace: input.memoryTrace,
    sources: input.sources,
  });
  const silenceRisk = detectSilenceRisk({
    scope: input.scope,
    customerStage: input.salesLoopPlan?.customerStage,
    dealSignals: input.salesLoopPlan?.dealSignals,
    memoryTrace: input.memoryTrace,
    sources: input.sources,
  });
  const abScripts = generateABCustomerScripts({
    scope: input.scope,
    customerStage: input.salesLoopPlan?.customerStage,
    dealSignals: input.salesLoopPlan?.dealSignals,
    dealProbability,
    silenceRisk,
    sources: input.sources,
  });
  const multiTurnPath = buildMultiTurnSalesPath({
    scope: input.scope,
    customerStage: input.salesLoopPlan?.customerStage,
    dealSignals: input.salesLoopPlan?.dealSignals,
    dealProbability,
    silenceRisk,
  });
  const followupTiming = buildFollowupTiming({
    scope: input.scope,
    dealProbability,
    silenceRisk,
  });
  const stopPush = buildStopPushRules({
    scope: input.scope,
    dealProbability,
    silenceRisk,
  });
  const base = {
    dealProbability,
    silenceRisk,
    abScripts,
    multiTurnPath,
    followupTiming,
    stopPush,
  };

  return {
    ...base,
    recommendedAction: pickRecommendedAction(base),
  };
}

export const buildRuntimeV2SalesLoopV2 = buildSalesLoopV2;
