import {
  getCleanEvidenceSummary,
  sanitizeVisibleText as sanitizeUserVisibleText
} from "@/lib/ai-chat/visible-output-sanitizer";

export type FinalizedAnswer = {
  title: string;
  problemUnderstanding: string;
  keyConclusion: string;
  suggestedSteps: string[];
  customerReply: string;
  nextAction: string;
  evidenceSummary?: string;
  confidenceLabel?: "高" | "中" | "低";
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
  sources?: Array<{ title?: string | null; score?: number | null }>;
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
  return buildDisplayMarkdown(answer);
}

export function finalizeUserAnswer(input: FinalizeUserAnswerInput): FinalizedAnswer {
  const original = cleanText(input.rawAnswer ?? "");
  const stripped = stripInternalLabels(original);
  const customerStripped = stripInternalLabels(input.customerAnswer ?? "");
  const businessContext = getRecord(input.businessContext);
  const agentContext = getRecord(input.agentContext);
  const problemUnderstanding = firstUseful(
    extractSection(stripped.text, ["问题判断", "业务问题分析", "问题分析"]),
    getString(businessContext.executionGoal),
    getString(agentContext.primaryObjective),
    firstSentence(stripped.text),
    input.userMessage ? `用户想确认：${cleanText(input.userMessage)}` : ""
  ) || "当前问题需要先判断客户真实顾虑，再给出稳妥回复。";
  const customerReply = firstUseful(
    extractSection(customerStripped.text, ["标准回复话术", "可直接复制给客户的话术", "可复制话术"]),
    getString(getRecord(businessContext.primaryAction).copySuggestion),
    getString(businessContext.closingScript),
    customerStripped.text,
    stripped.text
  ) || "理解的，我先帮您把重点梳理清楚，您看完再判断是否合适。";
  const suggestedSteps = buildSuggestedSteps(stripped.text, businessContext);
  const nextAction = firstUseful(
    extractSection(stripped.text, ["下一步行动", "下一步引导"]),
    getString(businessContext.nextBestQuestion),
    getString(agentContext.nextBestAction),
    getString(agentContext.followUpQuestion)
  ) || "先发送简洁话术，再根据客户反馈补充案例或对比方案。";
  const keyConclusion = firstUseful(
    extractSection(stripped.text, ["处理建议", "商业执行策略", "核心结论"]),
    suggestedSteps[0],
    "先降低沟通压力，再结合资料说明价值，避免直接催单。"
  );
  const evidenceSummary = buildEvidenceSummary(input);
  const finalized: FinalizedAnswer = {
    title: "处理建议",
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
  finalized.keyConclusion = sanitizeFinalText(finalized.keyConclusion);
  finalized.suggestedSteps = sanitizeVisibleList(finalized.suggestedSteps);
  finalized.customerReply = sanitizeFinalText(finalized.customerReply);
  finalized.nextAction = sanitizeFinalText(finalized.nextAction);
  finalized.evidenceSummary = sanitizeFinalText(finalized.evidenceSummary ?? "");
  finalized.debug = {
    removedInternalLabels: debug?.removedInternalLabels ?? [],
    originalLength: debug?.originalLength ?? original.length,
    finalLength: buildDisplayMarkdown(finalized).length
  };

  return finalized;
}
