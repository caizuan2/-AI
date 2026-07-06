import {
  getCleanEvidenceSummary,
  sanitizeVisibleSources,
  sanitizeVisibleText
} from "@/lib/ai-chat/visible-output-sanitizer";
import { processAIOutput } from "@/lib/enterprise/gpt-os-style-layer";
import type { ChatMessageView, ChatSource, FinalizedAnswerView } from "../types";

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

export interface AnalysisSectionDisplay {
  title: string;
  lines: string[];
}

export interface ProductAnswerDisplay {
  freeformAnswer: string;
  conclusion: string;
  decision: string;
  suggestions: string[];
  actionSuggestions: string[];
  customerReply: CustomerReplyDisplay;
  salesModes: SalesAnswerModeDisplay[];
  defaultMode: SalesAnswerModeKey;
  nextAction: string;
  analysis: string;
  analysisSections: AnalysisSectionDisplay[];
  evidenceSummary: string;
  sourceDetail: string;
  fullScriptText: string;
  fullAnswerText: string;
}

export interface DirectKnowledgeAnswerInput {
  answer: FinalizedAnswerView | null;
  userQuery?: string | null;
  hasRagHit?: boolean | null;
  sources?: ChatSource[] | null;
}

const MAX_CONCLUSION_LENGTH = 60;
const MAX_DECISION_LENGTH = 40;
const MAX_SUGGESTION_LENGTH = 40;
const MAX_ACTION_SUGGESTION_LENGTH = 38;
const CUSTOMER_REPLY_PREVIEW_LINES = 6;
const CUSTOMER_REPLY_PREVIEW_LENGTH = 180;
const CUSTOMER_REPLY_LONG_LENGTH = 300;

const internalLinePatterns = [
  /^(?:cold_user|warm_user|hot_user|buyer_user|lost_user|knowledge_user)$/i,
  /\b(?:prompt\.[\w.-]+|model_select|model_reason|model_fallback|model_metrics)\b/i,
  /\b(?:sourceApp|source_app|chunk|chunkId|chunk_id|kb_id|kbId|expert_id|expertId|tenant_id|tenantId)\b\s*[:=：]/i,
  /\b(?:debug|fallback|rules|endpoint|content-type|status)\b\s*[:=：]/i,
  /\b(?:cost_score|latency_score|success_rate|route_decision|provider_status)\b\s*[:=：]/i,
  /测试码\s*[:：]/i
];

const inlineReplacements: Array<[RegExp, string]> = [
  [/AI\s*Knowledge\s*OS\s*V[6-9](?:\.\d+)?/gi, ""],
  [/\bV[6-9](?:\.\d+)?\b/gi, ""],
  [/\b(?:cold_user|warm_user|hot_user|buyer_user|lost_user|knowledge_user)\b/gi, ""],
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
const factualKnowledgeQueryPattern =
  /成分|配方|含量|有哪些|是什么|说明书|怎么使用|怎么用|使用方法|使用方式|用法|步骤|功效|作用|效果|适合|禁忌|注意事项|价格|多少钱|规格|周期|流程|教程|资料|标准答案|介绍|讲一下|说一下/i;
const salesCommunicationQueryPattern =
  /怎么回复|如何回复|客户说|客户问|客户拒绝|帮我回|话术|发给客户|回复客户|复制给客户|考虑考虑|太贵|成交|转化|推进|跟进|促单|逼单|下单|签约|复购|异议|客户.*(?:价格|顾虑|担心|怎么办|怎么处理|如何处理)|(?:价格|顾虑|担心).*(?:客户)/i;
const weakGenericTemplatePattern =
  /先确认客户(?:当前)?(?:真实)?(?:目标|情况)|再给出(?:简洁且)?稳妥的说明|最后引导客户(?:回复|进入)?下一步|我先不直接给您固定方案|现在想先了解使用方式、周期安排，还是适不适合自己|确认后我再帮您整理一个简单、稳妥、方便执行的下一步|这条历史消息没有保留可直接展示的最终正文/;
const rawAnswerLeadPattern =
  /^(?:\s*(?:#{1,6}\s*)?(?:小董AI处理建议|小董AI|DeepSeek\s*原文输出|模型输出|主答案|最终正文|最终回复)\s*[:：]?\s*)+/i;
const forcedSectionStartPattern =
  /(?:^|\n)\s*(?:#{1,6}\s*)?(?:行动建议|详细分析|可直接发给客户|可直接复制给客户|三条现成话术|下一步动作|下一步|复制给客户|客户可复制话术)\s*[:：]\s*/i;
const legacyBusinessHeadingPattern =
  /(?:^|\n)\s*(?:#{1,6}\s*)?(?:【(?:用户意图|业务问题分析|问题判断|处理建议|商业执行策略|推荐动作|标准回复话术|下一步行动|引用依据|引用来源)】\s*)+/g;
const legacyBusinessStopPattern =
  /(?:^|\n)\s*(?:#{1,6}\s*)?【(?:商业执行策略|推荐动作|标准回复话术|下一步行动|引用依据|引用来源)】/i;

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

function normalizeFreeformAnswerText(text: unknown) {
  const value = typeof text === "string" ? text : "";

  if (!value) {
    return "";
  }

  return sanitizeVisibleText(stripInternalDebugText(value))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const legacyStructuredAnswerPattern =
  /(?:^|\n)\s*(?:#{1,6}\s*)?(?:DeepSeek 原文输出|一句话思路|三条现成话术|下一步动作|复制给客户|客户可复制话术|可直接复制给客户|RAG 命中结果|sources|hitCount|evidenceSummary|ProductAnswerView|V4|SOP|系统分析|诊断结果|命中文档)\s*[:：]?\s*(?:\n|$)|(?:^|\n|\s)【(?:用户意图|问题判断|处理建议|可直接复制给客户的话术|下一步行动|引用依据|引用来源|业务问题分析|商业执行策略|推荐动作|标准回复话术)】/i;
const legacyHeadingOnlyPattern =
  /^(?:\s*(?:#{1,6}\s*)?(?:\[(?:用户意图|问题判断|处理建议|业务问题分析|商业执行策略|推荐动作|标准回复话术|下一步行动|引用依据|引用来源)\]|【(?:用户意图|问题判断|处理建议|业务问题分析|商业执行策略|推荐动作|标准回复话术|下一步行动|引用依据|引用来源)】)\s*)+$/i;

export function normalizeRawAssistantText(text: unknown) {
  return normalizeFreeformAnswerText(text);
}

export function isLegacyStructuredAnswer(text: string) {
  const normalized = normalizeRawAssistantText(text);

  return legacyHeadingOnlyPattern.test(normalized) || legacyStructuredAnswerPattern.test(normalized);
}

export function stripLegacyStructuredTail(text: string) {
  const normalized = normalizeRawAssistantText(text);
  const match = normalized.match(legacyStructuredAnswerPattern);

  if (!match || typeof match.index !== "number" || match.index <= 0) {
    return "";
  }

  return normalized.slice(0, match.index).trim();
}

function getReplyText(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  const record = asRecord(value);

  return getString(record.fullText)
    || getString(record.previewText)
    || getString(record.text)
    || getString(record.answer)
    || getString(record.content);
}

export function pickSingleRawAssistantText(candidates: unknown[]) {
  const normalizedCandidates = candidates
    .map(normalizeRawAssistantText)
    .filter(Boolean);

  for (const candidate of normalizedCandidates) {
    if (!isLegacyStructuredAnswer(candidate)) {
      return candidate;
    }
  }

  for (const candidate of normalizedCandidates) {
    const stripped = stripLegacyStructuredTail(candidate);

    if (stripped) {
      return stripped;
    }
  }

  return "";
}

function isWeakGenericTemplate(text: string) {
  const normalized = normalizeRawAssistantText(text);

  if (!normalized) {
    return true;
  }

  return weakGenericTemplatePattern.test(normalized);
}

function trimBeforePattern(text: string, pattern: RegExp) {
  const match = text.match(pattern);

  if (!match || typeof match.index !== "number") {
    return text;
  }

  return text.slice(0, match.index).trim();
}

function extractMainAnswerBlock(text: unknown) {
  const normalized = normalizeRawAssistantText(text);

  if (!normalized) {
    return "";
  }

  const mainAnswerMatch = normalized.match(/(?:^|\n)\s*(?:主答案|最终正文|最终回复)\s*[:：]\s*([\s\S]*)/i);
  const base = mainAnswerMatch?.[1] ? mainAnswerMatch[1] : normalized;
  const withoutForcedSections = trimBeforePattern(
    trimBeforePattern(base, legacyBusinessStopPattern),
    forcedSectionStartPattern
  );

  return withoutForcedSections.trim();
}

function cleanLegacyHeadings(text: string) {
  return normalizeRawAssistantText(text)
    .replace(rawAnswerLeadPattern, "")
    .replace(legacyBusinessHeadingPattern, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hasMeaningfulNaturalAnswer(text: string) {
  const normalized = normalizeRawAssistantText(text);

  if (!normalized || legacyHeadingOnlyPattern.test(normalized)) {
    return false;
  }

  if (isWeakGenericTemplate(normalized) && normalized.length < 220) {
    return false;
  }

  return true;
}

function extractNaturalAnswerCandidate(text: unknown) {
  const mainBlock = extractMainAnswerBlock(text);
  const cleaned = cleanLegacyHeadings(mainBlock);

  return hasMeaningfulNaturalAnswer(cleaned) ? cleaned : "";
}

export function getNaturalMarkdownAnswerText(answer: unknown, extraCandidates: unknown[] = []) {
  const record = asRecord(answer);
  const candidates = [
    ...extraCandidates,
    record.freeformAnswer,
    record.rawContent,
    record.rawText,
    record.rawAnswer,
    record.answer,
    record.content,
    record.text,
    getReplyText(record.customerReply),
    getReplyText(record.customer_reply),
    record.customerAnswer,
    record.customer_answer
  ];

  for (const candidate of candidates) {
    const naturalAnswer = extractNaturalAnswerCandidate(candidate);

    if (!naturalAnswer) {
      continue;
    }

    return processAIOutput(naturalAnswer, {
      source: "user_chat_renderer",
      mode: "chatgpt_bubble"
    }).output;
  }

  return "";
}

export function shouldUseDirectKnowledgeAnswer(input: DirectKnowledgeAnswerInput) {
  const query = normalizeAnswerText(input.userQuery ?? "");
  const title = normalizeAnswerText(input.answer?.title ?? "");
  const searchText = `${query}\n${title}`;

  if (salesCommunicationQueryPattern.test(searchText)) {
    return false;
  }

  if (factualKnowledgeQueryPattern.test(searchText)) {
    return true;
  }

  return false;
}

export function getDirectKnowledgeAnswerText(answer: unknown, extraCandidates: unknown[] = []) {
  const record = asRecord(answer);
  const text = pickSingleRawAssistantText([
    record.freeformAnswer,
    record.rawContent,
    record.rawText,
    record.rawAnswer,
    record.answer,
    record.content,
    record.text,
    ...extraCandidates
  ]);

  return isWeakGenericTemplate(text) ? "" : text;
}

export function getFinalizedRawAnswerText(answer: unknown) {
  const record = asRecord(answer);

  return pickSingleRawAssistantText([
    getReplyText(record.customerReply),
    getReplyText(record.customer_reply),
    record.customerAnswer,
    record.customer_answer,
    record.standardReply,
    record.standard_reply,
    record.rawContent,
    record.rawText,
    record.text,
    record.answer,
    record.content,
    record.freeformAnswer
  ]);
}

export function getUserRawAnswerText(message: ChatMessageView) {
  const messageRecord = message as unknown as Record<string, unknown>;
  const metadata = asRecord(message.metadata);
  const finalizedAnswer = asRecord(message.finalized_answer);
  const metadataFinalizedAnswer = asRecord(metadata.finalizedAnswer);

  return pickSingleRawAssistantText([
    getFinalizedRawAnswerText(finalizedAnswer),
    getFinalizedRawAnswerText(metadataFinalizedAnswer),
    message.customer_answer,
    message.customerCopy,
    getReplyText(metadata.customerReply),
    getReplyText(metadata.customer_reply),
    metadata.customerAnswer,
    metadata.customer_answer,
    metadata.standardReply,
    metadata.standard_reply,
    message.content,
    messageRecord.rawContent,
    messageRecord.rawText,
    metadata.rawContent,
    metadata.rawAnswer,
    metadata.rawText,
    metadata.answer
  ]);
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
  const titleTopic = normalizeAnswerText(getString(asRecord(answer).title))
    .replace(/[？?。！!]+$/g, "");
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

  if (titleTopic && titleTopic.length <= 28 && !/小董AI|处理建议|回答|客户问题/.test(titleTopic)) {
    return titleTopic;
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
  const topic = scenario === "general" ? inferSalesTopic(answer) : getScenarioName(answer);
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
          `关于${topic}，不要一上来给固定答案。`,
          "先听清对方问的是思路、场景还是下一步动作。",
          "再用一个问题把范围缩小，这样更容易接下去。"
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
  const topic = inferSalesTopic(answer);
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
    scenario === "general"
      ? `关于${topic}，我先确认一下：您现在想弄清思路、步骤，还是具体执行？`
      : getClosingQuestion(answer),
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

function getAnalysisSeedLines(analysis: string, customerReply: CustomerReplyDisplay) {
  const replyKey = normalizedSimilarityKey(customerReply.previewText);

  return uniqueLines(splitReadableParagraphs(analysis)
    .map((line) => removeAnalysisTone(line)
      .replace(/(?:您好|可以的|理解的|没问题)[，,]?\s*/g, "")
      .replace(/您先回复我.*$/g, "")
      .replace(/复制(?:答案|客户话术|成交话术)?/g, "")
      .trim())
    .filter(Boolean)
    .filter((line) => !customerForbiddenPattern.test(line))
    .filter((line) => !/可直接发给客户|可推动下一步|适合自己理解|成交话术|客户对话|完整话术|话术模式/.test(line))
    .filter((line) => {
      const key = normalizedSimilarityKey(line);

      return key && !replyKey.includes(key.slice(0, 22));
    })
    .map((line) => truncateReadable(line, 64)))
    .slice(0, 4);
}

function compactAnalysisSection(title: string, lines: string[]) {
  const visibleLines = uniqueLines(lines
    .map((line) => truncateReadable(line, 64))
    .filter(Boolean))
    .slice(0, 4);

  return {
    title,
    lines: visibleLines.length >= 2
      ? visibleLines
      : [...visibleLines, "先把问题拆清楚，再决定下一句怎么接。"].slice(0, 3)
  };
}

function buildAnalysisSections(
  answer: unknown,
  analysis: string,
  decision: string,
  actionSuggestions: string[],
  customerReply: CustomerReplyDisplay
): AnalysisSectionDisplay[] {
  const scenario = inferSalesScenario(answer);
  const topic = inferSalesTopic(answer);
  const seeds = getAnalysisSeedLines(analysis, customerReply);

  if (scenario === "kks") {
    return [
      compactAnalysisSection("1. 先确认KKS使用目标", [
        seeds[0] || "客户问KKS怎么使用时，不适合直接套固定方案。",
        "先问清客户想改善什么、当前基础如何。",
        "这样后面的安排会更贴近真实情况。"
      ]),
      compactAnalysisSection("2. 再给出轻量使用方向", [
        seeds[1] || "把使用建议拆成周期、配合方式和注意点。",
        "先讲清楚大方向，不急着承诺效果。",
        "客户更容易理解，也更容易继续沟通。"
      ]),
      compactAnalysisSection("3. 最后引导客户补充情况", [
        seeds[2] || "用一个问题让客户说出目标和当前状态。",
        "拿到信息后，再继续整理更具体的方案。",
        "这样比直接推方案更稳妥。"
      ])
    ];
  }

  if (scenario === "price") {
    return [
      compactAnalysisSection("1. 先接住价格顾虑", [
        seeds[0] || "客户说太贵时，通常不是单纯拒绝。",
        "先承认对方的顾虑，不要马上反驳价格。",
        "这样能降低客户的防备感。"
      ]),
      compactAnalysisSection("2. 再确认顾虑来源", [
        seeds[1] || "要分清是预算压力，还是对效果没把握。",
        "不同原因对应不同回复方式。",
        "先问清楚，后面才不会说偏。"
      ]),
      compactAnalysisSection("3. 最后转到价值判断", [
        seeds[2] || "把重点从价格拉回客户真正想解决的问题。",
        "用轻量下一步让客户继续表达。",
        "不要强推成交，先推进判断。"
      ])
    ];
  }

  if (scenario === "consider") {
    return [
      compactAnalysisSection("1. 先接住客户犹豫", [
        seeds[0] || "客户说考虑考虑，多数是在给自己保留空间。",
        "这时继续催促容易让对方后退。",
        "先让客户感觉自己可以慢慢判断。"
      ]),
      compactAnalysisSection("2. 再找出真正卡点", [
        seeds[1] || "继续追问时要聚焦一个顾虑点。",
        "常见卡点是价格、效果、时间或信任。",
        "问得越具体，后面越容易接。"
      ]),
      compactAnalysisSection("3. 最后给低压力下一步", [
        seeds[2] || "不要要求客户马上决定。",
        "请客户先说最担心的一点。",
        "再根据回应继续解释或给方案。"
      ])
    ];
  }

  return [
    compactAnalysisSection(`1. 先界定“${topic}”的真实含义`, [
      seeds[0] || `对方问“${topic}”时，先不要直接给一套完整答案。`,
      "先确认他想问的是思路、场景，还是具体执行动作。",
      "这样可以避免答得很满，但没有接住真实问题。"
    ]),
    compactAnalysisSection("2. 再给出轻量下一步", [
      seeds[1] || "把问题拆成一个容易回复的小问题。",
      actionSuggestions[0] || "先让对方补充当前情况。",
      "客户愿意继续说，后面才好给更准的建议。"
    ]),
    compactAnalysisSection("3. 最后引导继续沟通", [
      seeds[2] || "最后用低压力表达收住话题。",
      decision,
      "不要急着下结论，先把下一轮对话接起来。"
    ])
  ];
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

  const freeformAnswer = normalizeFreeformAnswerText(answer.freeformAnswer)
    || normalizeFreeformAnswerText(asRecord(answer).answer);
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
  const analysisSections = buildAnalysisSections(answer, analysis, decision, actionSuggestions, customerReply);
  const evidenceSummary = normalizeAnswerText(answer.evidenceSummary)
    || getCleanEvidenceSummary(Boolean(sources?.length) || hasRagHit);
  const sourceDetail = getSourceDetail(sources, hasRagHit);
  const fullScriptText = salesModes
    .map((mode) => `【${mode.label}】\n${mode.text}`)
    .join("\n\n");
  const fullAnswerText = [
    "小董AI处理建议",
    "",
    freeformAnswer ? "主答案：" : "",
    freeformAnswer,
    freeformAnswer ? "" : "",
    "行动建议：",
    ...actionSuggestions.map((suggestion, index) => `${index + 1}. ${suggestion}`),
    "",
    "详细分析：",
    ...analysisSections.flatMap((section) => [
      section.title,
      ...section.lines
    ]),
    "",
    "可直接发给客户：",
    fullScriptText,
    "",
    `下一步：${nextAction}`
  ].filter(Boolean).join("\n");

  return {
    freeformAnswer,
    conclusion: decision,
    decision,
    suggestions: actionSuggestions,
    actionSuggestions,
    customerReply,
    salesModes,
    defaultMode,
    nextAction,
    analysis,
    analysisSections,
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
