import {
  getCleanEvidenceSummary,
  sanitizeVisibleText as sanitizeUserVisibleText
} from "@/lib/ai-chat/visible-output-sanitizer";
import {
  buildRuntimeV2HighDensityAnswer,
  isWeakRuntimeV2Answer
} from "@/lib/knowledge-runtime/runtime-v2-high-density-answer-policy";
import { applyRuntimeV2ComplianceBoundary } from "@/lib/knowledge-runtime/runtime-v2-compliance-boundary";
import { extractRuntimeV2CustomerScript } from "@/lib/knowledge-runtime/runtime-v2-customer-script-extractor";
import { buildObjectionHandlingPlan } from "@/lib/knowledge-runtime/runtime-v2-objection-handler";
import { buildRuntimeV2SalesFollowupPlan } from "@/lib/knowledge-runtime/runtime-v2-sales-followup-policy";
import { classifyRuntimeV2SalesIntent } from "@/lib/knowledge-runtime/runtime-v2-sales-intent-classifier";
import { buildRuntimeV2SalesLoop } from "@/lib/knowledge-runtime/runtime-v2-sales-loop-output";
import { buildSalesLoopV2 } from "@/lib/knowledge-runtime/runtime-v2-sales-loop-v2-output";
import { buildRuntimeV3GrowthOutput } from "@/lib/knowledge-runtime/runtime-v3-growth-engine";
import { buildRuntimeV4GrowthFlywheel } from "@/lib/knowledge-runtime/runtime-v4-flywheel-engine";
import { buildRuntimeV5EvolutionOutput } from "@/lib/knowledge-runtime/runtime-v5-output";
import type {
  RuntimeV2ABScripts,
  RuntimeV2BranchReply,
  RuntimeV2DealProbability,
  RuntimeV2DealSignal,
  RuntimeV2FollowupTiming,
  RuntimeV2FollowUpStep,
  RuntimeV2MultiTurnSalesPath,
  RuntimeV2SalesLoopPlan,
  RuntimeV2SalesLoopV2,
  RuntimeV2SilenceRisk,
  RuntimeV2StopPushPolicy
} from "@/lib/knowledge-runtime/runtime-v2-sales-loop-types";
import { classifyRuntimeV2UserIntent } from "@/lib/knowledge-runtime/runtime-v2-intent-classifier";
import type { RuntimeV2Input, RuntimeV2Source } from "@/lib/knowledge-runtime/runtime-v2-types";
import type { RuntimeV3GrowthOutput } from "@/lib/knowledge-runtime/runtime-v3-sales-learning-types";
import type { RuntimeV4GrowthFlywheelOutput } from "@/lib/knowledge-runtime/runtime-v4-growth-types";
import type { RuntimeV5EvolutionOutput } from "@/lib/knowledge-runtime/runtime-v5-strategy-types";

export type FinalizedAnswer = {
  title: string;
  freeformAnswer?: string;
  problemUnderstanding: string;
  keyConclusion: string;
  suggestedSteps: string[];
  customerReply: string;
  nextAction: string;
  evidenceSummary?: string;
  confidenceLabel?: "高" | "中" | "低";
  salesIntent?: string;
  customerStage?: string;
  salesStrategy?: string;
  nextActionDetail?: string;
  dealSignals?: RuntimeV2DealSignal[];
  salesLoopPlan?: RuntimeV2SalesLoopPlan;
  nextQuestion?: string;
  followupSequence?: RuntimeV2FollowUpStep[];
  branchReplies?: RuntimeV2BranchReply[];
  stopRules?: string[];
  stageReason?: string;
  salesLoopV2?: RuntimeV2SalesLoopV2;
  dealProbability?: RuntimeV2DealProbability;
  silenceRisk?: RuntimeV2SilenceRisk;
  abScripts?: RuntimeV2ABScripts;
  multiTurnPath?: RuntimeV2MultiTurnSalesPath;
  followupTiming?: RuntimeV2FollowupTiming;
  stopPush?: RuntimeV2StopPushPolicy;
  recommendedAction?: string;
  salesLearningV3?: RuntimeV3GrowthOutput;
  customerSegment?: RuntimeV3GrowthOutput["customerSegment"];
  conversionScore?: RuntimeV3GrowthOutput["conversionScore"];
  bestScriptRecommendation?: RuntimeV3GrowthOutput["bestScriptRecommendation"];
  nextBestActionV3?: RuntimeV3GrowthOutput["nextBestAction"];
  learningSignals?: RuntimeV3GrowthOutput["learningSignals"];
  optimizationReason?: string;
  isolationScope?: RuntimeV3GrowthOutput["isolationScope"];
  salesGrowthV4?: RuntimeV4GrowthFlywheelOutput;
  scriptScoreboardV4?: RuntimeV4GrowthFlywheelOutput["scriptScoreboard"];
  segmentPlaybookV4?: RuntimeV4GrowthFlywheelOutput["segmentPlaybook"];
  optimizedRecommendationV4?: RuntimeV4GrowthFlywheelOutput["optimizedRecommendation"];
  customerPathOptimizationV4?: RuntimeV4GrowthFlywheelOutput["customerPathOptimization"];
  growthMetricsV4?: RuntimeV4GrowthFlywheelOutput["metricsSummary"];
  growthWarningsV4?: RuntimeV4GrowthFlywheelOutput["warnings"];
  salesEvolutionV5?: RuntimeV5EvolutionOutput;
  strategyCandidates?: RuntimeV5EvolutionOutput["strategyCandidates"];
  promotedStrategies?: RuntimeV5EvolutionOutput["promotedStrategies"];
  reducedStrategies?: RuntimeV5EvolutionOutput["reducedStrategies"];
  retiredStrategies?: RuntimeV5EvolutionOutput["retiredStrategies"];
  roiSignals?: RuntimeV5EvolutionOutput["roiSignals"];
  conversionTrend?: RuntimeV5EvolutionOutput["conversionTrend"];
  evolvedPath?: RuntimeV5EvolutionOutput["evolvedPath"];
  autonomousRecommendation?: RuntimeV5EvolutionOutput["autonomousRecommendation"];
  complianceWarnings?: string[];
  debug?: {
    removedInternalLabels: string[];
    originalLength: number;
    finalLength: number;
  };
};

type FinalizeUserAnswerInput = {
  rawAnswer?: string;
  customerAnswer?: string;
  ragSummary?: string;
  sources?: Array<{
    title?: string | null;
    score?: number | null;
    snippet?: string | null;
    safeSnippet?: string | null;
    content_preview?: string | null;
    contentPreview?: string | null;
    sourceApp?: string | null;
    knowledgeBaseId?: string | null;
    kbId?: string | null;
    agentId?: string | null;
    expertId?: string | null;
    namespace?: string | null;
    tenantId?: string | null;
  }>;
  businessContext?: unknown;
  agentContext?: unknown;
  userMessage?: string;
};

const INTERNAL_LABEL_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "AI Knowledge OS V6", pattern: /AI\s+Knowledge\s+OS\s+V6/gi },
  { label: "AI Knowledge OS V7", pattern: /AI\s+Knowledge\s+OS\s+V7(?:\.\d+)?/gi },
  { label: "AI Knowledge OS V8", pattern: /AI\s+Knowledge\s+OS\s+V8(?:\.\d+)?/gi },
  { label: "AI Knowledge OS V9", pattern: /AI\s+Knowledge\s+OS\s+V9/gi },
  { label: "prompt.education", pattern: /prompt\.(?:education|proof|handoff)\s*[:：]?\s*[^\n]*/gi },
  { label: "commercial intent", pattern: /\b(?:cold_user|warm_user|hot_user|buyer_user|lost_user|knowledge_user)\b/gi },
  { label: "agent action", pattern: /\b(?:identify|ACTION_\d+|action score|conversion_signal|global learning score|global learning)\b\s*[:：]?\s*[^\n]*/gi },
  { label: "model debug", pattern: /\b(?:model route debug|model_select|model_reason|model_fallback|model_metrics|route_decision|fallback_chain|deepseek|qwen|kimi|glm)\b\s*[:：]?\s*[^\n]*/gi },
  { label: "score", pattern: /\b(?:score|success_rate|latency_score|cost_score|内部评分)\b\s*[:：]?\s*\d+(?:\.\d+)?%?/gi }
];

const SECTION_TITLES = [
  "用户意图",
  "业务问题分析",
  "商业执行策略",
  "推荐动作",
  "标准回复话术",
  "下一步行动",
  "问题判断",
  "处理建议",
  "可直接复制给客户的话术"
];

function cleanText(value: unknown) {
  return typeof value === "string"
    ? value
      .replace(/\u0000/g, "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
    : "";
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function getString(value: unknown) {
  return cleanText(value);
}

function stripInternalLabels(value: string) {
  let text = cleanText(value);
  const removedInternalLabels = new Set<string>();

  for (const { label, pattern } of INTERNAL_LABEL_PATTERNS) {
    if (pattern.test(text)) {
      removedInternalLabels.add(label);
    }

    text = text.replace(pattern, "");
    pattern.lastIndex = 0;
  }

  return {
    text: normalizeWhitespace(text),
    removedInternalLabels: Array.from(removedInternalLabels)
  };
}

function normalizeWhitespace(value: string) {
  return cleanText(value)
    .replace(/\n\s*[-*]\s*\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+([，。；：！？])/g, "$1")
    .trim();
}

function splitLines(value: string) {
  return normalizeWhitespace(value)
    .split(/\n+/)
    .map((line) => line.replace(/^[-*•\d.、\s]+/, "").trim())
    .filter(Boolean);
}

function splitSentences(value: string) {
  return normalizeWhitespace(value)
    .split(/(?<=[。！？；;])|\n+/)
    .map((line) => line.replace(/^[-*•\d.、\s]+/, "").trim())
    .filter(Boolean);
}

function extractSection(value: string, titles: string[]) {
  const titlePattern = titles.map((title) => title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const regex = new RegExp(`【(?:${titlePattern})】\\s*([\\s\\S]*?)(?=\\n?【|$)`, "i");
  const match = value.match(regex);

  return normalizeWhitespace(match?.[1] ?? "");
}

function firstUseful(...values: string[]) {
  for (const value of values) {
    const text = normalizeWhitespace(value);

    if (text) {
      return text;
    }
  }

  return "";
}

function sanitizeFinalText(value: string) {
  return sanitizeUserVisibleText(stripInternalLabels(value).text);
}

function sanitizeVisibleList(values: string[]) {
  return values
    .map(sanitizeFinalText)
    .filter(Boolean);
}

function firstSentence(...values: string[]) {
  for (const value of values) {
    const sentence = splitSentences(value)[0];

    if (sentence) {
      return sentence;
    }
  }

  return "";
}

function buildSuggestedSteps(rawText: string, businessContext: unknown) {
  const context = getRecord(businessContext);
  const primaryAction = getRecord(context.primaryAction);
  const secondaryActions = Array.isArray(context.secondaryActions)
    ? context.secondaryActions.map(getRecord)
    : [];
  const fromContext = [
    getString(primaryAction.description),
    getString(primaryAction.copySuggestion),
    ...secondaryActions.map((action) => getString(action.description))
  ].filter(Boolean);

  const fromText = splitLines(extractSection(rawText, ["处理建议", "推荐动作", "商业执行策略", "建议步骤"]));
  const steps = [...fromText, ...fromContext]
    .map((step) => step.replace(/^ACTION_\d+\s*[:：-]?\s*/i, "").trim())
    .filter(Boolean);

  return Array.from(new Set(steps)).slice(0, 3);
}

function buildEvidenceSummary(input: FinalizeUserAnswerInput) {
  const ragSummary = cleanText(input.ragSummary);

  if (ragSummary) {
    return sanitizeUserVisibleText(ragSummary) || getCleanEvidenceSummary(true);
  }

  const sources = input.sources ?? [];

  return getCleanEvidenceSummary(sources.length > 0);
}

function resolveConfidenceLabel(sources: FinalizeUserAnswerInput["sources"]): "高" | "中" | "低" {
  const scores = (sources ?? [])
    .map((source) => typeof source.score === "number" ? source.score : Number.NaN)
    .filter(Number.isFinite);
  const bestScore = scores.length > 0 ? Math.max(...scores) : 0;

  if (bestScore >= 0.72) {
    return "高";
  }

  if (bestScore >= 0.45) {
    return "中";
  }

  return "低";
}

function toRuntimeInput(input: FinalizeUserAnswerInput): RuntimeV2Input {
  const primarySource = (input.sources ?? []).find(Boolean);

  return {
    query: cleanText(input.userMessage ?? input.rawAnswer ?? ""),
    knowledgeBaseId: primarySource?.knowledgeBaseId ?? null,
    kbId: primarySource?.kbId ?? null,
    agentId: primarySource?.agentId ?? null,
    expertId: primarySource?.expertId ?? null,
    namespace: primarySource?.namespace ?? null,
    tenantId: primarySource?.tenantId ?? null,
    appType: "user_app",
    channel: "chat-ui",
    platform: "web",
    outputMode: "auto",
  };
}

function toRuntimeSources(sources: FinalizeUserAnswerInput["sources"]): RuntimeV2Source[] {
  return (sources ?? []).map((source) => ({
    title: source.title ?? undefined,
    score: source.score ?? undefined,
    snippet: source.snippet ?? source.content_preview ?? undefined,
    safeSnippet: source.safeSnippet ?? undefined,
    contentPreview: source.contentPreview ?? source.content_preview ?? undefined,
    sourceApp: source.sourceApp ?? undefined,
    knowledgeBaseId: source.knowledgeBaseId ?? undefined,
    kbId: source.kbId ?? undefined,
    agentId: source.agentId ?? undefined,
    expertId: source.expertId ?? undefined,
    namespace: source.namespace ?? undefined,
    tenantId: source.tenantId ?? undefined,
  }));
}

function buildFreeformAnswer(input: FinalizeUserAnswerInput, rawText: string) {
  const runtimeInput = toRuntimeInput(input);
  const sources = toRuntimeSources(input.sources);
  const intentProfile = classifyRuntimeV2UserIntent(runtimeInput);
  const cleaned = sanitizeFinalText(rawText);
  const needsUpgrade =
    isWeakRuntimeV2Answer(cleaned) ||
    (intentProfile.requiresTable && !/\|.+\|/.test(cleaned));

  return needsUpgrade
    ? buildRuntimeV2HighDensityAnswer(runtimeInput, { sources, rawAnswer: cleaned })
    : cleaned;
}

function buildDisplayMarkdown(answer: FinalizedAnswer) {
  const steps = answer.suggestedSteps.length > 0
    ? answer.suggestedSteps.map((step, index) => `${index + 1}. ${step}`).join("\n")
    : "1. 先确认客户的具体顾虑。\n2. 再结合实际资料给出稳妥回复。";

  return [
    "【问题判断】",
    answer.problemUnderstanding,
    "",
    "【处理建议】",
    answer.keyConclusion,
    steps,
    "",
    "【可直接复制给客户的话术】",
    answer.customerReply,
    "",
    "【下一步行动】",
    answer.nextAction,
    "",
    "【引用依据】",
    answer.evidenceSummary ?? "已参考小董AI大脑🧠中的相关资料。"
  ].join("\n").trim();
}

export function formatFinalizedAnswerForDisplay(answer: FinalizedAnswer) {
  const freeformAnswer = sanitizeFinalText(answer.freeformAnswer ?? "");
  const structured = buildDisplayMarkdown(answer);

  if (!freeformAnswer) {
    return structured;
  }

  return [freeformAnswer, structured].filter(Boolean).join("\n\n");
}

export function finalizeUserAnswer(input: FinalizeUserAnswerInput): FinalizedAnswer {
  const original = cleanText(input.rawAnswer ?? "");
  const stripped = stripInternalLabels(original);
  const customerStripped = stripInternalLabels(input.customerAnswer ?? "");
  const businessContext = getRecord(input.businessContext);
  const agentContext = getRecord(input.agentContext);
  const freeformAnswer = buildFreeformAnswer(input, stripped.text);
  const runtimeInput = toRuntimeInput(input);
  const runtimeSources = toRuntimeSources(input.sources);
  const salesProfile = classifyRuntimeV2SalesIntent(runtimeInput, { sources: runtimeSources });
  const objectionPlan = buildObjectionHandlingPlan({ scope: runtimeInput, salesProfile, sources: runtimeSources });
  const followupPlan = buildRuntimeV2SalesFollowupPlan(runtimeInput, salesProfile);
  const salesLoopPlan = buildRuntimeV2SalesLoop({ scope: runtimeInput, sources: runtimeSources });
  const salesLoopV2 = buildSalesLoopV2({
    scope: runtimeInput,
    sources: runtimeSources,
    salesIntent: salesProfile.salesIntent,
    salesLoopPlan
  });
  const problemUnderstanding = firstUseful(
    objectionPlan.diagnosis,
    extractSection(stripped.text, ["问题判断", "业务问题分析", "问题分析"]),
    getString(businessContext.executionGoal),
    getString(agentContext.primaryObjective),
    firstSentence(stripped.text),
    input.userMessage ? `用户想确认：${cleanText(input.userMessage)}` : ""
  ) || "当前问题需要先判断客户真实顾虑，再给出稳妥回复。";
  const customerReply = firstUseful(
    extractRuntimeV2CustomerScript(
      {
        customerCopy: customerStripped.text,
        answer: freeformAnswer,
      },
      runtimeInput,
      { sources: runtimeSources, answer: freeformAnswer },
    ),
    salesLoopPlan.nextCustomerMessage,
    extractSection(customerStripped.text, ["标准回复话术", "可直接复制给客户的话术", "可复制话术"]),
    getString(getRecord(businessContext.primaryAction).copySuggestion),
    getString(businessContext.closingScript),
    customerStripped.text,
    stripped.text
  ) || "理解的，我先帮您把重点梳理清楚，您看完再判断是否合适。";
  const suggestedSteps = buildSuggestedSteps(stripped.text, businessContext);
  const nextAction = firstUseful(
    extractSection(stripped.text, ["下一步行动", "下一步引导"]),
    objectionPlan.nextAction,
    salesLoopPlan.nextQuestion,
    followupPlan.nextQuestion,
    getString(businessContext.nextBestQuestion),
    getString(agentContext.nextBestAction),
    getString(agentContext.followUpQuestion)
  ) || "先发送简洁话术，再根据客户反馈补充案例或对比方案。";
  const keyConclusion = firstUseful(
    extractSection(stripped.text, ["处理建议", "商业执行策略", "核心结论"]),
    objectionPlan.responseStrategy,
    suggestedSteps[0],
    "先降低沟通压力，再结合资料说明价值，避免直接催单。"
  );
  const evidenceSummary = buildEvidenceSummary(input);
  const finalized: FinalizedAnswer = {
    title: "处理建议",
    freeformAnswer,
    problemUnderstanding,
    keyConclusion,
    suggestedSteps: suggestedSteps.length > 0 ? suggestedSteps : [
      "先共情客户当前顾虑。",
      "再结合小董AI大脑🧠资料说明价值或使用方式。",
      "最后给出低压力的下一步选择。"
    ],
    customerReply,
    nextAction,
    evidenceSummary,
    confidenceLabel: resolveConfidenceLabel(input.sources),
    salesIntent: salesProfile.salesIntent,
    customerStage: salesLoopPlan.customerStage || salesProfile.customerStage,
    salesStrategy: salesProfile.recommendedStrategy,
    nextActionDetail: salesLoopPlan.nextCustomerMessage || followupPlan.nextMessage,
    dealSignals: salesLoopPlan.dealSignals,
    salesLoopPlan,
    nextQuestion: salesLoopPlan.nextQuestion,
    followupSequence: salesLoopPlan.followupSequence,
    branchReplies: salesLoopPlan.branchReplies,
    stopRules: salesLoopPlan.stopRules,
    stageReason: salesLoopPlan.stageReason,
    salesLoopV2,
    dealProbability: salesLoopV2.dealProbability,
    silenceRisk: salesLoopV2.silenceRisk,
    abScripts: salesLoopV2.abScripts,
    multiTurnPath: salesLoopV2.multiTurnPath,
    followupTiming: salesLoopV2.followupTiming,
    stopPush: salesLoopV2.stopPush,
    recommendedAction: salesLoopV2.recommendedAction,
    debug: {
      removedInternalLabels: Array.from(new Set([
        ...stripped.removedInternalLabels,
        ...customerStripped.removedInternalLabels,
        ...SECTION_TITLES.filter((title) => original.includes(`【${title}】`))
      ])),
      originalLength: original.length,
      finalLength: 0
    }
  };

  const debug = finalized.debug;
  finalized.problemUnderstanding = sanitizeFinalText(finalized.problemUnderstanding);
  finalized.freeformAnswer = sanitizeFinalText(finalized.freeformAnswer ?? "");
  finalized.keyConclusion = sanitizeFinalText(finalized.keyConclusion);
  finalized.suggestedSteps = sanitizeVisibleList(finalized.suggestedSteps);
  finalized.customerReply = sanitizeFinalText(finalized.customerReply);
  finalized.nextAction = sanitizeFinalText(finalized.nextAction);
  finalized.nextActionDetail = sanitizeFinalText(finalized.nextActionDetail ?? "");
  finalized.recommendedAction = sanitizeFinalText(finalized.recommendedAction ?? "");
  const safe = applyRuntimeV2ComplianceBoundary({
    answer: finalized.freeformAnswer,
    customerCopy: finalized.customerReply,
    nextStep: finalized.nextAction,
    nextAction: finalized.nextActionDetail,
  }, runtimeInput, salesProfile);
  finalized.freeformAnswer = safe.answer ?? finalized.freeformAnswer;
  finalized.customerReply = safe.customerCopy ?? finalized.customerReply;
  finalized.nextAction = safe.nextStep ?? finalized.nextAction;
  finalized.nextActionDetail = safe.nextAction ?? finalized.nextActionDetail;
  finalized.recommendedAction = sanitizeFinalText(finalized.recommendedAction || finalized.nextActionDetail || finalized.nextAction);
  finalized.complianceWarnings = safe.complianceWarnings;
  const salesLearningV3 = buildRuntimeV3GrowthOutput({
    scope: runtimeInput,
    sources: runtimeSources,
    salesLoopPlan,
    salesLoopV2,
    dealProbability: salesLoopV2.dealProbability,
    silenceRisk: salesLoopV2.silenceRisk,
    dealSignals: salesLoopPlan.dealSignals,
    abScripts: salesLoopV2.abScripts,
    complianceWarnings: safe.complianceWarnings,
    rawValue: {
      businessContext: input.businessContext,
      agentContext: input.agentContext,
      customerReply: finalized.customerReply,
      nextAction: finalized.nextAction,
    },
  });
  finalized.salesLearningV3 = salesLearningV3;
  finalized.customerSegment = salesLearningV3.customerSegment;
  finalized.conversionScore = salesLearningV3.conversionScore;
  finalized.bestScriptRecommendation = salesLearningV3.bestScriptRecommendation;
  finalized.nextBestActionV3 = salesLearningV3.nextBestAction;
  finalized.learningSignals = salesLearningV3.learningSignals;
  finalized.optimizationReason = salesLearningV3.optimizationReason;
  finalized.isolationScope = salesLearningV3.isolationScope;
  const salesGrowthV4 = buildRuntimeV4GrowthFlywheel({
    scope: runtimeInput,
    salesLearningV3,
    abScripts: salesLoopV2.abScripts,
    dealSignals: salesLoopPlan.dealSignals,
    multiTurnPath: salesLoopV2.multiTurnPath,
  });
  finalized.salesGrowthV4 = salesGrowthV4;
  finalized.scriptScoreboardV4 = salesGrowthV4.scriptScoreboard;
  finalized.segmentPlaybookV4 = salesGrowthV4.segmentPlaybook;
  finalized.optimizedRecommendationV4 = salesGrowthV4.optimizedRecommendation;
  finalized.customerPathOptimizationV4 = salesGrowthV4.customerPathOptimization;
  finalized.growthMetricsV4 = salesGrowthV4.metricsSummary;
  finalized.growthWarningsV4 = salesGrowthV4.warnings;
  const salesEvolutionV5 = buildRuntimeV5EvolutionOutput({
    scope: runtimeInput,
    salesLearningV3,
    salesGrowthV4,
    dealSignals: salesLoopPlan.dealSignals,
    silenceRisk: salesLoopV2.silenceRisk,
    currentConversionScore: salesLearningV3.conversionScore,
    sources: runtimeSources,
    industryHint: salesProfile.salesIntent,
  });
  finalized.salesEvolutionV5 = salesEvolutionV5;
  finalized.strategyCandidates = salesEvolutionV5.strategyCandidates;
  finalized.promotedStrategies = salesEvolutionV5.promotedStrategies;
  finalized.reducedStrategies = salesEvolutionV5.reducedStrategies;
  finalized.retiredStrategies = salesEvolutionV5.retiredStrategies;
  finalized.roiSignals = salesEvolutionV5.roiSignals;
  finalized.conversionTrend = salesEvolutionV5.conversionTrend;
  finalized.evolvedPath = salesEvolutionV5.evolvedPath;
  finalized.autonomousRecommendation = salesEvolutionV5.autonomousRecommendation;
  finalized.evidenceSummary = sanitizeFinalText(finalized.evidenceSummary ?? "");
  finalized.debug = {
    removedInternalLabels: debug?.removedInternalLabels ?? [],
    originalLength: debug?.originalLength ?? original.length,
    finalLength: formatFinalizedAnswerForDisplay(finalized).length
  };

  return finalized;
}
