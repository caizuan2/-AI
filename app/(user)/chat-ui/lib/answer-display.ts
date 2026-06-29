import {
  getCleanEvidenceSummary,
  sanitizeVisibleSources,
  sanitizeVisibleText
} from "@/lib/ai-chat/visible-output-sanitizer";
import type { ChatSource, FinalizedAnswerView } from "../types";

export interface CustomerReplyDisplay {
  previewText: string;
  fullText: string;
  hasFullText: boolean;
}

export type SalesAnswerModeKey = "explain" | "customer_chat" | "closing";

export interface SalesAnswerModeDisplay {
  key: SalesAnswerModeKey;
  label: string;
  title: string;
  copyLabel: string;
  text: string;
}

export interface ProductAnswerDisplay {
  conclusion: string;
  decision: string;
  suggestions: string[];
  actionSuggestions: string[];
  customerReply: CustomerReplyDisplay;
  salesModes: SalesAnswerModeDisplay[];
  defaultMode: SalesAnswerModeKey;
  nextAction: string;
  analysis: string;
  evidenceSummary: string;
  sourceDetail: string;
  fullScriptText: string;
  fullAnswerText: string;
}

const MAX_CONCLUSION_LENGTH = 60;
const MAX_DECISION_LENGTH = 40;
const MAX_SUGGESTION_LENGTH = 40;
const MAX_ACTION_SUGGESTION_LENGTH = 38;
const CUSTOMER_REPLY_PREVIEW_LINES = 6;
const CUSTOMER_REPLY_PREVIEW_LENGTH = 180;
const CUSTOMER_REPLY_LONG_LENGTH = 300;

const internalLinePatterns = [
  /\b(?:prompt\.[\w.-]+|model_select|model_reason|model_fallback|model_metrics)\b/i,
  /\b(?:sourceApp|source_app|chunk|chunkId|chunk_id|kb_id|kbId|expert_id|expertId|tenant_id|tenantId)\b\s*[:=：]/i,
  /\b(?:debug|fallback|rules|endpoint|content-type|status)\b\s*[:=：]/i,
  /\b(?:cost_score|latency_score|success_rate|route_decision|provider_status)\b\s*[:=：]/i,
  /测试码\s*[:：]/i
];

const inlineReplacements: Array<[RegExp, string]> = [
  [/AI\s*Knowledge\s*OS\s*V[6-9](?:\.\d+)?/gi, ""],
  [/\bV[6-9](?:\.\d+)?\b/gi, ""],
  [/\bprompt\.[\w.-]+\s*[:：]?\s*[^\n。；！？]*/gi, ""],
  [/\bACTION_\d+\b\s*[:：-]?\s*/gi, ""],
  [/\bACTION\b\s*[:：-]?\s*/gi, ""],
  [/\b(?:model_select|model_reason|model_fallback|model_metrics)\b\s*[:=：]?\s*[^\n。；！？]*/gi, ""],
  [/\b(?:sourceApp|source_app|chunkId|chunk_id|kb_id|kbId|expert_id|expertId|tenant_id|tenantId)\s*[:=：]\s*[\w.-]+/gi, ""],
  [/\bchunk\s*[:=：#-]?\s*[\w.-]*/gi, ""],
  [/\b(?:debug|fallback|rules|endpoint|content-type|status)\b\s*[:=：]\s*[^\n。；！？]*/gi, ""],
  [/测试码\s*[:：]\s*[^\n。；！？]*/gi, ""],
  [/测试专属话术/g, "专属话术"],
  [/\s+\d+[.、]\s*(?:联通|相关资料)\s*(?=\n|$)/g, ""],
  [/^\s*(?:联通|相关资料)\s*$/gm, ""],
  [/当用户问[“"][^”"]+[”"]时[，,]?\s*/g, ""],
  [/标准回答必须包含\s*[:：]\s*/g, ""],
  [/必须包含\s*[:：]\s*/g, ""],
  [/已根据知识库资料和用户问题进行判断\s*[:：]?/g, ""],
  [/已根据知识库资料整理如下[，,]?\s*可直接复制给客户。?/g, ""],
  [/根据知识库资料整理如下[，,]?\s*可直接复制给客户。?/g, ""],
  [/结合现有信息整理如下[，,]?\s*可直接复制给客户。?/g, ""],
  [/根据知识库资料/g, "结合现有信息"],
  [/资料显示/g, ""],
  [/系统判断/g, ""],
  [/\bXD-[A-Z0-9-]+(?:-[\u4e00-\u9fa5A-Za-z0-9]+)*/gi, "相关资料"]
];

const customerForbiddenPattern = /根据知识库|知识库资料|系统判断|资料显示|当前系统|sourceApp|chunk|kb_id|expert_id|tenant_id|debug|fallback/i;
const closingPushPattern = /我先|确认|下一步|方案|您看|回复我|帮您整理/;
const questionPattern = /[？?]/;

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getStringField(answer: unknown, keys: string[]) {
  const record = asRecord(answer);

  for (const key of keys) {
    const value = normalizeAnswerText(record[key]);

    if (value) {
      return value;
    }
  }

  return "";
}

function getStringArrayField(answer: unknown, keys: string[]) {
  const record = asRecord(answer);

  for (const key of keys) {
    const value = record[key];

    if (!Array.isArray(value)) {
      continue;
    }

    const items = value
      .map((item) => normalizeAnswerText(getString(item)))
      .filter(Boolean);

    if (items.length > 0) {
      return items;
    }
  }

  return [];
}

export function stripInternalDebugText(text: string) {
  let cleaned = text.replace(/\u0000/g, "").replace(/\r\n/g, "\n");

  for (const [pattern, replacement] of inlineReplacements) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  return cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !internalLinePatterns.some((pattern) => pattern.test(line)))
    .join("\n");
}

export function normalizeAnswerText(text: unknown) {
  const value = typeof text === "string" ? text : "";

  if (!value) {
    return "";
  }

  return sanitizeVisibleText(stripInternalDebugText(value))
    .replace(/\*\*/g, "")
    .replace(/[`#>]/g, "")
    .replace(/(^|\n)\s*\d+[.、]\s*/g, "$1")
    .replace(/\s+\d+[.、]\s*(?=\n|$)/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+([，。；：！？])/g, "$1")
    .trim();
}

export function stripMarkdownNoise(text: string) {
  return normalizeAnswerText(text)
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*```[\s\S]*?```/gm, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .trim();
}

export function cleanVisibleAnswerText(text: unknown) {
  return stripMarkdownNoise(typeof text === "string" ? text : "");
}

function stripListMarker(text: string) {
  return text.replace(/^\s*[-*•\d.、)\]]+\s*/, "").trim();
}

function truncateReadable(text: string, maxLength: number) {
  const normalized = normalizeAnswerText(text).replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  const head = normalized.slice(0, maxLength);
  const lastBreak = Math.max(
    head.lastIndexOf("。"),
    head.lastIndexOf("；"),
    head.lastIndexOf("，"),
    head.lastIndexOf("、"),
    head.lastIndexOf(" ")
  );
  const compact = lastBreak >= Math.floor(maxLength * 0.55)
    ? head.slice(0, lastBreak)
    : head.slice(0, maxLength - 1);

  return `${compact.trim()}…`;
}

export function splitReadableParagraphs(text: string) {
  const normalized = cleanVisibleAnswerText(text);

  if (!normalized) {
    return [];
  }

  return normalized
    .replace(/【([^】]+)】/g, "\n【$1】\n")
    .split(/\n+|(?<=[。！？；;])\s*/)
    .map(stripListMarker)
    .map(normalizeAnswerText)
    .filter(Boolean);
}

export function splitShortLines(text: string, maxLineLength = 34) {
  const paragraphs = splitReadableParagraphs(text);
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxLineLength) {
      lines.push(paragraph);
      continue;
    }

    const sentenceParts = paragraph
      .split(/(?<=[，。；！？、])\s*/)
      .map((part) => cleanVisibleAnswerText(part))
      .filter(Boolean);
    let current = "";

    for (const part of sentenceParts.length > 0 ? sentenceParts : [paragraph]) {
      const next = current ? `${current}${part}` : part;

      if (next.length <= maxLineLength) {
        current = next;
        continue;
      }

      if (current) {
        lines.push(current);
      }

      if (part.length <= maxLineLength) {
        current = part;
        continue;
      }

      const chunks = part.match(new RegExp(`.{1,${maxLineLength}}`, "g")) ?? [];
      lines.push(...chunks.map(cleanVisibleAnswerText).filter(Boolean));
      current = "";
    }

    if (current) {
      lines.push(current);
    }
  }

  return lines.filter(Boolean);
}

function uniqueLines(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizeAnswerText(value);
    const key = normalized.replace(/\s+/g, "").toLowerCase();

    if (!normalized || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSection(text: string, labels: string[]) {
  const normalized = normalizeAnswerText(text);

  if (!normalized) {
    return "";
  }

  const titlePattern = labels.map(escapeRegExp).join("|");
  const bracketRegex = new RegExp(`【(?:${titlePattern})】\\s*([\\s\\S]*?)(?=\\n?【|$)`, "i");
  const bracketMatch = normalized.match(bracketRegex);

  if (bracketMatch?.[1]) {
    return normalizeAnswerText(bracketMatch[1]);
  }

  const colonRegex = new RegExp(`(?:^|\\n)(?:${titlePattern})\\s*[:：]\\s*([\\s\\S]*?)(?=\\n\\S{2,18}\\s*[:：]|\\n?【|$)`, "i");
  const colonMatch = normalized.match(colonRegex);

  return normalizeAnswerText(colonMatch?.[1] ?? "");
}

function getRawAnswerText(answer: unknown) {
  return uniqueLines([
    getStringField(answer, ["summary", "conclusion", "keyConclusion", "problemUnderstanding", "answerSummary", "answer", "content"]),
    getStringField(answer, ["customerReply", "customer_reply", "customer_answer"]),
    getStringField(answer, ["nextAction", "next_action"])
  ]).join("\n\n");
}

export function extractOneLineConclusion(answer: unknown) {
  const raw = getRawAnswerText(answer);
  const fromFields = getStringField(answer, ["summary", "conclusion", "keyConclusion", "answerSummary"]);
  const fromSections = extractSection(raw, ["一句话结论", "核心结论", "处理建议", "商业执行策略", "问题判断"]);
  const firstLine = splitReadableParagraphs(fromSections || fromFields || raw)[0] ?? "";

  return truncateReadable(firstLine || "先确认客户真实诉求，再给出清晰、稳妥的下一步建议。", MAX_CONCLUSION_LENGTH);
}

export function compressConclusion(answer: unknown) {
  return extractOneLineConclusion(answer);
}

export function extractShortSuggestions(answer: unknown) {
  const raw = getRawAnswerText(answer);
  const fromFields = getStringArrayField(answer, ["suggestedSteps", "suggestions", "steps"]);
  const fromSections = splitReadableParagraphs(
    extractSection(raw, ["处理建议", "推荐动作", "商业执行策略", "建议步骤", "怎么做"])
  );
  const fallback = splitReadableParagraphs(raw).slice(1);
  const customerReply = extractCustomerReply(answer).previewText.replace(/\s+/g, "");
  const suggestions = uniqueLines([...fromFields, ...fromSections, ...fallback])
    .filter((item) => !customerReply.includes(item.replace(/\s+/g, "").slice(0, 24)))
    .filter((item) => !/我先按|知识库资料|可直接复制给客户|已根据/.test(item))
    .map((item) => truncateReadable(item, MAX_SUGGESTION_LENGTH))
    .filter(Boolean)
    .slice(0, 3);

  return suggestions.length > 0 ? suggestions : [
    "先确认客户当前最关心的问题。",
    "再结合实际资料给出简洁说明。",
    "最后给客户一个低压力下一步。"
  ];
}

export function compressSuggestions(answer: unknown) {
  return extractShortSuggestions(answer);
}

function getSalesRawText(answer: unknown) {
  const record = asRecord(answer);

  return uniqueLines([
    getString(record.title),
    getRawAnswerText(answer),
    getStringField(answer, ["customerReply", "customer_reply", "customerAnswer", "customer_answer", "standardReply"]),
    getString(record.evidenceSummary)
  ]).join("\n");
}

function inferSalesTopic(answer: unknown) {
  const raw = getSalesRawText(answer);
  const quoted = raw.match(/[「“"]([^」”"]{2,28})[」”"]/);
  const quotedTopic = normalizeAnswerText(quoted?.[1] ?? "")
    .replace(/^关于/, "")
    .replace(/[？?。！!]+$/g, "");

  if (/KKS/i.test(raw)) {
    return "KKS";
  }

  if (/太贵|价格|预算|费用/.test(raw)) {
    return "价格顾虑";
  }

  if (/考虑考虑|再考虑|犹豫|纠结/.test(raw)) {
    return "客户犹豫";
  }

  if (quotedTopic) {
    return quotedTopic;
  }

  if (/客户/.test(raw)) {
    return "客户问题";
  }

  return "这个问题";
}

function inferSalesScenario(answer: unknown) {
  const raw = getSalesRawText(answer);

  if (/KKS/i.test(raw)) {
    return "kks";
  }

  if (/太贵|价格|预算|费用/.test(raw)) {
    return "price";
  }

  if (/考虑考虑|再考虑|犹豫|纠结/.test(raw)) {
    return "consider";
  }

  return "general";
}

export function removeAnalysisTone(text: string) {
  return cleanVisibleAnswerText(text)
    .replace(/(?:已?根据|结合)(?:知识库资料|现有信息|资料|内容)[，,]?\s*/g, "")
    .replace(/(?:系统判断|资料显示|我们认为|当前建议基于|从资料看)[，,]?\s*/g, "")
    .replace(/我先按.*?回答你这个问题[；;，,。]?/g, "")
    .replace(/如果你是要发给客户.*?话术[；;，,。]?/g, "")
    .replace(/可直接复制给客户[。；;，,]?/g, "")
    .replace(/适用范围或特殊细节[，,]?\s*建议再由工作人员进一步确认[。；;，,]?/g, "")
    .replace(/工作人员进一步确认[。；;，,]?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function removeRiskyClaims(text: string) {
  return text
    .replace(/一定(?:能|会|可以)?/g, "尽量")
    .replace(/不尽量/g, "不一定")
    .replace(/保证/g, "尽量")
    .replace(/包[瘦好过赚]/g, "尽量改善")
    .replace(/立刻见效/g, "逐步观察")
    .replace(/马上成交/g, "推进下一步")
    .replace(/必须购买/g, "可以再判断")
    .replace(/不买就/g, "如果暂时不合适也可以先");
}

export function cleanSalesScript(text: string) {
  return splitShortLines(removeRiskyClaims(removeAnalysisTone(text)), 44)
    .map((line) => line
      .replace(/^关于[「“"]?(.+?)[」”"]?[，,]?\s*可以这样理解[：:]?\s*/g, "关于$1，")
      .replace(/^您好[，,]\s*关于[「“"]?(.+?)[」”"]?[，,]\s*/g, "您好，关于$1，")
      .trim())
    .filter(Boolean)
    .slice(0, 6)
    .join("\n")
    .trim();
}

function normalizeModeLines(lines: string[], maxLines: number, maxLineLength: number) {
  return uniqueLines(lines
    .map((line) => cleanSalesScript(line)
      .replace(customerForbiddenPattern, "")
      .replace(/\s+/g, " ")
      .trim())
    .filter(Boolean))
    .slice(0, maxLines)
    .map((line) => truncateReadable(line, maxLineLength))
    .join("\n")
    .trim();
}

function getScenarioName(answer: unknown) {
  const scenario = inferSalesScenario(answer);

  if (scenario === "kks") {
    return "KKS使用";
  }

  if (scenario === "price") {
    return "价格顾虑";
  }

  if (scenario === "consider") {
    return "客户犹豫";
  }

  return "客户问题";
}

export function ensureCustomerTone(text: string) {
  const lines = splitShortLines(cleanSalesScript(text).replace(customerForbiddenPattern, ""), 38)
    .filter(Boolean)
    .slice(0, 6);

  if (lines.length === 0) {
    return "您好，我先帮您把情况简单确认清楚。\n确认后再给您一个更合适的安排。\n这样更稳妥，也方便判断下一步。";
  }

  if (!/^(您好|可以的|理解|没问题|好的)/.test(lines[0])) {
    lines[0] = `您好，${lines[0].replace(/^您?好[，,]?/, "")}`;
  }

  return lines.join("\n");
}

function getScenarioDecision(answer: unknown) {
  const scenario = inferSalesScenario(answer);

  if (scenario === "kks") {
    return "先确认客户目标，再给出匹配的KKS方案。";
  }

  if (scenario === "price") {
    return "先接住价格顾虑，再引导客户看价值。";
  }

  if (scenario === "consider") {
    return "先接住客户犹豫，再确认真实顾虑。";
  }

  return "先确认客户目标，再给出稳妥下一步。";
}

export function compressDecision(answer: unknown) {
  const rawDecision = getScenarioDecision(answer) || compressConclusion(answer);
  const cleaned = removeAnalysisTone(rawDecision);
  const prefixed = /^(建议|先|再|可以)/.test(cleaned) ? cleaned : `先${cleaned}`;

  return truncateReadable(prefixed, MAX_DECISION_LENGTH);
}

export function buildActionSuggestions(answer: unknown) {
  const scenario = inferSalesScenario(answer);
  const suggestions = scenario === "kks"
    ? ["先问清客户目标和当前基础。", "再说明按周期安排会更稳妥。", "最后引导客户确认是否要方案。"]
    : scenario === "price"
      ? ["先认可客户觉得贵的感受。", "再确认客户真正担心的点。", "最后引导客户看价值和下一步。"]
      : scenario === "consider"
        ? ["先接住客户想考虑的决定。", "再确认最影响判断的顾虑。", "最后给客户低压力下一步。"]
        : ["先确认客户当前真实目标。", "再给出简洁且稳妥的说明。", "最后引导客户回复下一步。"];

  return uniqueLines(suggestions)
    .map((item) => truncateReadable(item, MAX_ACTION_SUGGESTION_LENGTH))
    .slice(0, 3);
}

export function buildExplainMode(answer: unknown) {
  const scenario = inferSalesScenario(answer);
  const topic = getScenarioName(answer);
  const lines = scenario === "kks"
    ? [
      "KKS使用不适合一开始直接套固定方案。",
      "更稳妥的做法是先确认目标和当前基础。",
      "再按周期整理建议，避免客户盲目判断。"
    ]
    : scenario === "price"
      ? [
        "客户说贵时，问题不一定只是价格。",
        "通常要先分清是预算压力，还是对效果没把握。",
        "处理重点是降低判断压力，再说明价值。"
      ]
      : scenario === "consider"
        ? [
          "客户说考虑考虑，多数是在保留选择空间。",
          "这时不适合继续催促成交。",
          "先找出真实顾虑，再决定下一句怎么接。"
        ]
        : [
          `${topic}要先判断客户真正卡在哪里。`,
          "先把问题拆清楚，再给出简洁建议。",
          "这样比直接给结论更稳。"
        ];

  return normalizeModeLines(lines, 4, 36)
    .replace(/您看.*$/gm, "")
    .replace(/您好[，,]?/g, "")
    .trim();
}

export function buildCustomerChatMode(answer: unknown) {
  const topic = inferSalesTopic(answer);
  const scenario = inferSalesScenario(answer);
  const lines = scenario === "kks"
    ? [
      "您好，KKS怎么使用我先帮您简单确认一下。",
      "不同目标适合的安排会不太一样。",
      "我先了解下您的当前情况和想改善的方向。",
      "再给您一个更合适的使用建议。",
      "这样不会盲目套方案，也更稳妥。"
    ]
    : scenario === "price"
      ? [
        "理解的，您觉得价格要再看看很正常。",
        "我先不催您决定。",
        "您现在主要是觉得预算压力大，还是担心不适合自己？",
        "我先帮您把重点讲简单一点。",
        "您看完再判断，会更轻松。"
      ]
      : scenario === "consider"
        ? [
          "可以的，您考虑一下很正常。",
          "我也不想让您仓促决定。",
          "您现在主要是在价格、效果，还是时间安排上有顾虑？",
          "您告诉我一个最担心的点。",
          "我先帮您讲清楚，您再判断。"
        ]
        : [
          `您好，关于${topic}，我先帮您简单确认一下情况。`,
          "我先不急着给您下结论。",
          "确认清楚后，再给您一个更适合的建议。",
          "您把当前最关心的一点发我就可以。"
        ];

  return ensureCustomerTone(normalizeModeLines(lines, 6, 38));
}

function getClosingQuestion(answer: unknown) {
  const scenario = inferSalesScenario(answer);

  if (scenario === "kks") {
    return "我先确认两个点：您现在主要想改善什么？目标大概是多少？";
  }

  if (scenario === "price") {
    return "我先确认一下：您主要担心预算，还是担心效果不确定？";
  }

  if (scenario === "consider") {
    return "我先确认一下：您最犹豫的是价格、效果，还是时间安排？";
  }

  return "我先确认一下：您现在最想解决的是哪一个点？";
}

export function buildClosingScriptMode(answer: unknown) {
  const scenario = inferSalesScenario(answer);
  const opener = scenario === "price"
    ? "可以的，价格这块我先不直接劝您定。"
    : scenario === "consider"
      ? "可以的，我先不催您马上决定。"
      : "可以的，我先不直接给您套固定方案。";
  const lines = [
    opener,
    getClosingQuestion(answer),
    "确认后我再帮您整理一个简单方案。",
    "如果不合适，您也可以先不急着定。",
    "您先回复我这两个点，我再继续帮您判断。"
  ];

  const script = ensureCustomerTone(normalizeModeLines(lines, 6, 40));

  if (questionPattern.test(script) && closingPushPattern.test(script)) {
    return script;
  }

  return ensureCustomerTone([
    opener,
    getClosingQuestion(answer),
    "确认后我再帮您整理一个简单方案。",
    "您看我先这样帮您梳理可以吗？"
  ].join("\n"));
}

function ensureDistinctModeText(mode: SalesAnswerModeDisplay, answer: unknown) {
  if (mode.key === "explain") {
    return { ...mode, text: buildExplainMode(answer) };
  }

  if (mode.key === "customer_chat") {
    return { ...mode, text: buildCustomerChatMode(answer) };
  }

  return { ...mode, text: buildClosingScriptMode(answer) };
}

export function dedupeModes(modes: SalesAnswerModeDisplay[], answer?: unknown) {
  const normalizedModes = modes.map((mode) => ensureDistinctModeText(mode, answer));
  const seen = new Set<string>();

  return normalizedModes.map((mode) => {
    const key = normalizedSimilarityKey(mode.text);
    const otherTexts = normalizedModes
      .filter((candidate) => candidate.key !== mode.key)
      .map((candidate) => candidate.text);
    const tooSimilar = otherTexts.some((text) => getSimilarityScore(mode.text, text) > 0.66);
    const invalidCustomer = mode.key === "customer_chat" && customerForbiddenPattern.test(mode.text);
    const invalidClosing = mode.key === "closing" && (!questionPattern.test(mode.text) || !closingPushPattern.test(mode.text));
    const invalidExplain = mode.key === "explain" && /您好|您看|可以吗|回复我/.test(mode.text);

    if (!seen.has(key) && !tooSimilar && !invalidCustomer && !invalidClosing && !invalidExplain) {
      seen.add(key);
      return mode;
    }

    const distinctMode = ensureDistinctModeText(mode, answer);
    seen.add(normalizedSimilarityKey(distinctMode.text));

    return distinctMode;
  });
}

function compactCustomerReply(fullText: string) {
  const paragraphs = splitReadableParagraphs(fullText)
    .map((paragraph) => paragraph
      .replace(/我先按.*?回答你这个问题[；;，,。]?/g, "")
      .replace(/如果你是要发给客户.*?话术[；;，,。]?/g, "")
      .replace(/当前建议基于.*?整理[；;，,。]?/g, "")
      .replace(/(?:已?根据知识库资料|结合现有信息)整理如下[，,]?\s*可直接复制给客户[。；;，,]?/g, "")
      .trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return "理解的，我先帮您把重点梳理清楚，您看完再判断下一步是否合适。";
  }

  const lines = splitShortLines(paragraphs.join("\n"), 34);
  const result: string[] = [];
  let totalLength = 0;

  for (const line of lines) {
    const nextLength = totalLength + line.length;

    if (result.length >= CUSTOMER_REPLY_PREVIEW_LINES || nextLength > CUSTOMER_REPLY_PREVIEW_LENGTH) {
      break;
    }

    result.push(line);
    totalLength = nextLength;
  }

  return result.length > 0 ? result.join("\n") : truncateReadable(paragraphs.join(""), CUSTOMER_REPLY_PREVIEW_LENGTH);
}

export function extractCustomerReply(answer: unknown): CustomerReplyDisplay {
  const raw = getRawAnswerText(answer);
  const fromFields = getStringField(answer, [
    "customerReply",
    "customer_reply",
    "customerAnswer",
    "customer_answer",
    "standardReply"
  ]);
  const fromSections = extractSection(raw, [
    "可直接发给客户",
    "标准回复话术",
    "客户话术",
    "可直接复制给客户的话术",
    "话术"
  ]);
  const fullText = normalizeAnswerText(fromFields || fromSections || raw)
    || "理解的，我先帮您把重点梳理清楚，您看完再判断下一步是否合适。";
  const previewText = compactCustomerReply(fullText);

  return {
    previewText,
    fullText,
    hasFullText: shouldCollapseLongText(fullText) || normalizeAnswerText(previewText) !== fullText
  };
}

export function compressCustomerReply(answer: unknown) {
  return extractCustomerReply(answer).previewText;
}

function normalizedSimilarityKey(text: string) {
  return normalizeAnswerText(text).replace(/[\s，。；：！？、,.!?:;"'`~()[\]{}<>《》【】]/g, "").toLowerCase();
}

function getSimilarityScore(first: string, second: string) {
  const firstKey = normalizedSimilarityKey(first);
  const secondKey = normalizedSimilarityKey(second);

  if (!firstKey || !secondKey) {
    return 0;
  }

  if (firstKey === secondKey) {
    return 1;
  }

  const firstTokens = new Set(Array.from(firstKey));
  const secondTokens = new Set(Array.from(secondKey));
  const overlap = Array.from(firstTokens).filter((token) => secondTokens.has(token)).length;
  const base = Math.max(firstTokens.size, secondTokens.size, 1);

  return overlap / base;
}

export function dedupeRepeatedText(primary: string, secondary: string) {
  const first = normalizeAnswerText(primary);
  const second = normalizeAnswerText(secondary);
  const firstKey = normalizedSimilarityKey(first);
  const secondKey = normalizedSimilarityKey(second);

  if (!first || !second) {
    return { primary: first, secondary: second };
  }

  if (firstKey.includes(secondKey) || secondKey.includes(firstKey)) {
    return first.length <= second.length
      ? { primary: first, secondary: "" }
      : { primary: "", secondary: second };
  }

  const firstSentences = splitReadableParagraphs(first);
  const secondSentences = splitReadableParagraphs(second);
  const firstSentenceKeys = new Set(firstSentences.map(normalizedSimilarityKey).filter(Boolean));
  const secondWithoutDuplicates = secondSentences
    .filter((sentence) => !firstSentenceKeys.has(normalizedSimilarityKey(sentence)))
    .join("\n");

  return { primary: first, secondary: normalizeAnswerText(secondWithoutDuplicates || second) };
}

export function dedupeAnswerSections(sections: string[]) {
  return uniqueLines(sections);
}

export function shouldCollapseLongText(text: string) {
  const normalized = normalizeAnswerText(text);

  return normalized.length > CUSTOMER_REPLY_LONG_LENGTH || splitReadableParagraphs(normalized).length > CUSTOMER_REPLY_PREVIEW_LINES;
}

function buildAnalysis(answer: unknown, conclusion: string, suggestions: string[], customerReply: CustomerReplyDisplay) {
  const answerRecord = asRecord(answer);
  const raw = getRawAnswerText(answer);
  const analysisCandidates = uniqueLines([
    getString(answerRecord.problemUnderstanding),
    getString(answerRecord.keyConclusion),
    ...getStringArrayField(answer, ["suggestedSteps", "suggestions", "steps"]),
    extractSection(raw, ["业务问题分析", "详细分析", "问题分析", "为什么", "注意事项"]),
    raw
  ]);
  const visibleAnalysis = analysisCandidates
    .filter((item) => {
      const itemKey = normalizedSimilarityKey(item);

      return itemKey
        && itemKey !== normalizedSimilarityKey(conclusion)
        && !suggestions.some((suggestion) => normalizedSimilarityKey(suggestion) === itemKey)
        && !normalizedSimilarityKey(customerReply.previewText).includes(itemKey);
    })
    .join("\n\n");

  return normalizeAnswerText(visibleAnalysis || "当前建议基于客户问题和小董AI大脑🧠资料整理，建议结合实际客户语境微调后再发送。");
}

export function extractFullAnalysis(answer: unknown) {
  const conclusion = compressConclusion(answer);
  const suggestions = compressSuggestions(answer);
  const customerReply = extractCustomerReply(answer);

  return buildAnalysis(answer, conclusion, suggestions, customerReply);
}

export function extractFullCustomerReply(answer: unknown) {
  return extractCustomerReply(answer).fullText;
}

export function extractEvidenceSummary(answer: unknown) {
  return normalizeAnswerText(asRecord(answer).evidenceSummary);
}

function getSalesNextAction(answer: unknown) {
  const scenario = inferSalesScenario(answer);

  if (scenario === "kks") {
    return "请客户补充目标和当前情况，再给方案。";
  }

  if (scenario === "price") {
    return "请客户说出最担心的一点，再做价值说明。";
  }

  if (scenario === "consider") {
    return "请客户选出最犹豫的点，再继续跟进。";
  }

  return "请客户补充当前情况，再给下一步建议。";
}

function getRawSourceTitle(source: ChatSource, index: number) {
  return source.title
    || source.knowledgeBaseId
    || source.agentId
    || source.namespace
    || source.chunk_id
    || `小董AI大脑资料 ${index + 1}`;
}

function getSourceAppDetail(source: ChatSource) {
  return source.sourceApp
    || (source.includePublished ? "published" : "")
    || (source.includeShared ? "shared" : "")
    || "";
}

function getSourceDetail(sources?: ChatSource[] | null, hasRagHit = false) {
  const rawSources = (sources ?? []).slice(0, 3);

  if (rawSources.length === 0) {
    return hasRagHit
      ? "已命中小董AI大脑🧠，来源标题仍在同步整理。"
      : "暂无可展开的明确来源。";
  }

  const visibleSources = sanitizeVisibleSources(rawSources);
  const titles = rawSources.map((source, index) => {
    const visibleTitle = visibleSources[index]?.title;
    const sourceApp = getSourceAppDetail(source);
    const title = visibleTitle || getRawSourceTitle(source, index);

    return sourceApp ? `${title} / ${sourceApp}` : title;
  });

  return `参考资料：${titles.join("、")}`;
}

export function buildSalesAnswerDisplay(
  answer: FinalizedAnswerView | null,
  sources?: ChatSource[] | null,
  hasRagHit = false
): ProductAnswerDisplay | null {
  if (!answer) {
    return null;
  }

  const decision = compressDecision(answer);
  const dedupedSuggestions = buildActionSuggestions(answer)
    .filter((suggestion) => normalizedSimilarityKey(suggestion) !== normalizedSimilarityKey(decision))
    .slice(0, 3);
  const actionSuggestions = dedupedSuggestions.length > 0 ? dedupedSuggestions : [
    "先确认客户当前真实目标。",
    "再给出简洁且稳妥的说明。",
    "最后引导客户回复下一步。"
  ];
  const salesModes = dedupeModes([
    {
      key: "explain",
      label: "解释",
      title: "适合自己理解",
      copyLabel: "复制解释",
      text: buildExplainMode(answer)
    },
    {
      key: "customer_chat",
      label: "客户对话",
      title: "可直接发给客户",
      copyLabel: "复制客户话术",
      text: buildCustomerChatMode(answer)
    },
    {
      key: "closing",
      label: "成交话术",
      title: "可推动下一步",
      copyLabel: "复制成交话术",
      text: buildClosingScriptMode(answer)
    }
  ], answer);
  const defaultMode: SalesAnswerModeKey = salesModes.some((mode) => mode.key === "closing" && /[？?]/.test(mode.text))
    ? "closing"
    : "customer_chat";
  const defaultScript = salesModes.find((mode) => mode.key === defaultMode)?.text
    ?? salesModes.find((mode) => mode.key === "customer_chat")?.text
    ?? extractCustomerReply(answer).previewText;
  const customerReply: CustomerReplyDisplay = {
    previewText: defaultScript,
    fullText: defaultScript,
    hasFullText: false
  };
  const nextAction = truncateReadable(getSalesNextAction(answer), 60);
  const analysis = buildAnalysis(answer, decision, actionSuggestions, customerReply);
  const evidenceSummary = normalizeAnswerText(answer.evidenceSummary)
    || getCleanEvidenceSummary(Boolean(sources?.length) || hasRagHit);
  const sourceDetail = getSourceDetail(sources, hasRagHit);
  const fullScriptText = salesModes
    .map((mode) => `【${mode.label}】\n${mode.text}`)
    .join("\n\n");
  const fullAnswerText = [
    "小董AI处理建议",
    "",
    `判断：${decision}`,
    "",
    "行动建议：",
    ...actionSuggestions.map((suggestion, index) => `${index + 1}. ${suggestion}`),
    "",
    "话术模式：",
    fullScriptText,
    "",
    `下一步：${nextAction}`,
    "",
    "详细分析：",
    analysis,
    "",
    evidenceSummary
  ].filter(Boolean).join("\n");

  return {
    conclusion: decision,
    decision,
    suggestions: actionSuggestions,
    actionSuggestions,
    customerReply,
    salesModes,
    defaultMode,
    nextAction,
    analysis,
    evidenceSummary,
    sourceDetail,
    fullScriptText,
    fullAnswerText
  };
}

export function buildProductAnswerDisplay(
  answer: FinalizedAnswerView | null,
  sources?: ChatSource[] | null,
  hasRagHit = false
) {
  return buildSalesAnswerDisplay(answer, sources, hasRagHit);
}
