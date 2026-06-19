import "server-only";

export interface GptStructuredKnowledge {
  title: string;
  category: string;
  summary: string;
  tags: string[];
  question: string;
  answer: string;
  confidence: number;
  saveSuggestion: boolean;
  followUpQuestions: string[];
}

export interface NormalizedGptOutput {
  replyMarkdown: string;
  structured: GptStructuredKnowledge;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => readString(item)).filter(Boolean).slice(0, 8)
    : [];
}

function readConfidence(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numberValue)) {
    return 82;
  }

  return Math.min(100, Math.max(0, Math.round(numberValue)));
}

function extractJsonText(text: string) {
  const codeFence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (codeFence?.[1]) {
    return codeFence[1].trim();
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }

  return text;
}

function parseMaybeJson(text: string) {
  try {
    return JSON.parse(extractJsonText(text)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function fallbackTitle(input: string, category: string) {
  const firstLine = input.split("\n").find((line) => line.trim())?.trim() ?? "";

  if (firstLine) {
    return firstLine.length > 28 ? `${firstLine.slice(0, 28)}...` : firstLine;
  }

  return `${category.replace("知识库", "") || "管理员"}投喂知识`;
}

function inferCategory(input: string, fallback: string) {
  if (fallback) {
    return fallback;
  }

  if (/退款|售后|换货|保修|工单|退货/.test(input)) {
    return "售后知识库";
  }

  if (/价格|报价|客户|异议|话术|咨询/.test(input)) {
    return "客服话术库";
  }

  if (/产品|功能|版本|套餐|权益/.test(input)) {
    return "产品知识库";
  }

  if (/制度|审批|流程|规范|报销|考勤/.test(input)) {
    return "企业制度库";
  }

  return "默认知识库";
}

function buildFallbackMarkdown(input: string, structured: GptStructuredKnowledge) {
  return [
    `## ${structured.title}`,
    "",
    structured.summary,
    "",
    "### 建议沉淀方式",
    `- 分类：${structured.category}`,
    `- 标签：${structured.tags.join("、") || "AI投喂"}`,
    `- 入库建议：${structured.saveSuggestion ? "建议入库" : "建议先复核"}`,
    "",
    "### 标准问答",
    `**问：**${structured.question}`,
    "",
    `**答：**${structured.answer || input.slice(0, 240)}`
  ].join("\n");
}

export function normalizeGptOutput(input: {
  rawText: string;
  originalInput: string;
  fallbackCategory: string;
}): NormalizedGptOutput {
  const parsed = parseMaybeJson(input.rawText);
  const category = inferCategory(input.originalInput, readString(parsed?.category) || input.fallbackCategory);
  const title = readString(parsed?.title) || fallbackTitle(input.originalInput, category);
  const summary = readString(parsed?.summary) || input.originalInput.slice(0, 220);
  const tags = readStringArray(parsed?.tags);
  const structured: GptStructuredKnowledge = {
    title,
    category,
    summary,
    tags: tags.length > 0 ? tags : [category.replace("知识库", ""), "GPT投喂"].filter(Boolean),
    question: readString(parsed?.question) || `关于“${title}”，一线人员应该如何处理？`,
    answer: readString(parsed?.answer) || summary,
    confidence: readConfidence(parsed?.confidence),
    saveSuggestion: typeof parsed?.saveSuggestion === "boolean" ? parsed.saveSuggestion : true,
    followUpQuestions: readStringArray(parsed?.followUpQuestions)
  };
  const replyMarkdown = readString(parsed?.replyMarkdown) || buildFallbackMarkdown(input.originalInput, structured);

  return {
    replyMarkdown,
    structured
  };
}
