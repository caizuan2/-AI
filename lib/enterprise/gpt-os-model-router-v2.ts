import "server-only";

import type { OpenAIAdminIngestAttachment } from "@/lib/enterprise/openai-ingest-client";

export type ModelType =
  | "kimi"
  | "deepseek-pro"
  | "deepseek-flash"
  | "qwen"
  | "openai";

export type ModelTaskType =
  | "document_ingest"
  | "knowledge_summarize"
  | "batch_draft"
  | "chat"
  | "general";

export type ModelCostMode = "low" | "balanced" | "high";

export interface ModelRoutingContext {
  taskType?: ModelTaskType;
  costMode?: ModelCostMode;
  language?: "zh" | "en" | "mixed" | "unknown";
  input?: string | null;
  attachments?: OpenAIAdminIngestAttachment[];
  selectedModelLabel?: string | null;
  modelDisplayName?: string | null;
  preferredModel?: string | null;
}

const DOCUMENT_EXTENSIONS = /\.(pdf|doc|docx|ppt|pptx)$/i;
const DOCUMENT_MIME_KEYWORDS = ["pdf", "word", "presentation", "powerpoint", "officedocument"];

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function hasChinese(value: string | null | undefined) {
  return /[\u3400-\u9fff]/.test(value ?? "");
}

function hasDocumentAttachment(attachments: OpenAIAdminIngestAttachment[] | undefined) {
  return (attachments ?? []).some((attachment) => {
    const fileName = attachment.fileName ?? "";
    const mimeType = `${attachment.mimeType ?? ""} ${attachment.fileType ?? ""}`.toLowerCase();

    return DOCUMENT_EXTENSIONS.test(fileName)
      || DOCUMENT_MIME_KEYWORDS.some((keyword) => mimeType.includes(keyword));
  });
}

function inferTaskType(ctx: ModelRoutingContext): ModelTaskType {
  if (ctx.taskType) {
    return ctx.taskType;
  }

  if (hasDocumentAttachment(ctx.attachments)) {
    return "document_ingest";
  }

  const input = normalizeText(ctx.input);

  if (/总结|归纳|提炼|知识点|标准问答|sop|入库/.test(input)) {
    return "knowledge_summarize";
  }

  if (/批量|草稿|初稿|低成本|快速/.test(input)) {
    return "batch_draft";
  }

  if (/你好|聊|对话|问答/.test(input)) {
    return "chat";
  }

  return "general";
}

function inferLanguage(ctx: ModelRoutingContext): "zh" | "en" | "mixed" | "unknown" {
  if (ctx.language) {
    return ctx.language;
  }

  const input = ctx.input ?? "";
  const hasZh = hasChinese(input);
  const hasEn = /[a-z]/i.test(input);

  if (hasZh && hasEn) {
    return "mixed";
  }

  if (hasZh) {
    return "zh";
  }

  if (hasEn) {
    return "en";
  }

  return "unknown";
}

export function unifiedRouter(ctx: ModelRoutingContext): ModelType {
  const taskType = inferTaskType(ctx);
  const language = inferLanguage(ctx);

  if (taskType === "document_ingest") {
    return "kimi";
  }

  if (taskType === "knowledge_summarize") {
    return "deepseek-pro";
  }

  if (ctx.costMode === "low" || taskType === "batch_draft") {
    return "deepseek-flash";
  }

  if (ctx.costMode === "high") {
    return "deepseek-pro";
  }

  const explicitHint = [
    ctx.selectedModelLabel,
    ctx.modelDisplayName,
    ctx.preferredModel
  ].map(normalizeText).join(" ");

  if (explicitHint.includes("kimi") || explicitHint.includes("moonshot")) {
    return "kimi";
  }

  if (explicitHint.includes("flash")) {
    return "deepseek-flash";
  }

  if (explicitHint.includes("deepseek")) {
    return "deepseek-pro";
  }

  if (explicitHint.includes("qwen") || explicitHint.includes("通义")) {
    return "qwen";
  }

  if (explicitHint.includes("gpt") || explicitHint.includes("openai")) {
    return "deepseek-pro";
  }

  if (language === "zh") {
    return "qwen";
  }

  return "deepseek-pro";
}

export function routeModel(ctx: ModelRoutingContext): ModelType {
  return unifiedRouter(ctx);
}

export function buildEnterpriseFallbackChain(primary: ModelType): ModelType[] {
  const fallbackOrder: ModelType[] = ["deepseek-pro", "qwen", "deepseek-flash", "openai"];

  if (primary === "kimi") {
    return ["kimi", ...fallbackOrder];
  }

  const startIndex = fallbackOrder.indexOf(primary);

  if (startIndex < 0) {
    return fallbackOrder;
  }

  return fallbackOrder.slice(startIndex);
}

export function modelTypeToProvider(modelType: ModelType): "openai" | "deepseek" | "qwen" | "kimi" {
  if (modelType === "deepseek-pro" || modelType === "deepseek-flash") {
    return "deepseek";
  }

  return modelType;
}

export function getModelTypeCostLevel(modelType: ModelType): "low" | "medium" | "high" {
  if (modelType === "openai" || modelType === "kimi") {
    return "high";
  }

  if (modelType === "qwen" || modelType === "deepseek-pro") {
    return "medium";
  }

  return "low";
}
