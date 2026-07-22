import "server-only";

import {
  knowledgeDraftToStructured,
  normalizeGptKnowledgeDraft,
  type GptKnowledgeDraft,
  type GptSaveRecommendation,
  type GptStructuredKnowledge
} from "@/lib/enterprise/gpt-knowledge-draft";
import {
  buildFallbackUserClientCallPlan,
  normalizeUserClientCallPlan,
  type GptUserClientCallPlan
} from "@/lib/enterprise/gpt-user-client-call-plan";
import { enrichDraftWithKnowledgeFactoryV5 } from "@/lib/enterprise/knowledge-factory-v5";
import { processAIOutput } from "@/lib/enterprise/gpt-os-style-layer";

export type { GptStructuredKnowledge } from "@/lib/enterprise/gpt-knowledge-draft";

export interface NormalizedGptOutput {
  replyMarkdown: string;
  knowledgeDraft: GptKnowledgeDraft;
  suggestedQuestions: string[];
  saveRecommendation: GptSaveRecommendation;
  userClientCallPlan: GptUserClientCallPlan;
  diagnostics: string[];
  structured: GptStructuredKnowledge;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function limitNaturalText(value: string, maxLength = 260) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).replace(/[，,。；;、\s]+$/, "")}...`;
}

function buildNaturalFallbackReply(input: {
  originalInput: string;
  draft: GptKnowledgeDraft;
  suggestedQuestions: string[];
}) {
  const summary = limitNaturalText(input.draft.summary || input.originalInput, 260);
  const standardAnswer = limitNaturalText(input.draft.standardAnswer || summary, 420);
  const questions = input.suggestedQuestions.slice(0, 3);

  return [
    `可以，我先按自然对话的方式帮你整理。核心意思是：${summary}`,
    "",
    "如果要直接对外说明，可以这样表达：",
    "",
    `> ${standardAnswer}`,
    "",
    questions.length > 0 ? "后续如果要继续完善，可以再补充这几个点：" : "",
    ...questions.map((question) => `- ${question}`)
  ].filter(Boolean).join("\n");
}

export function extractResponsesText(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const record = payload as Record<string, unknown>;

  if (typeof record.output_text === "string" && record.output_text.trim()) {
    return record.output_text.trim();
  }

  const output = Array.isArray(record.output) ? record.output : [];
  const parts: string[] = [];

  for (const item of output) {
    if (typeof item === "string" && item.trim()) {
      parts.push(item.trim());
      continue;
    }

    if (!item || typeof item !== "object") {
      continue;
    }

    const itemRecord = item as Record<string, unknown>;

    if (typeof itemRecord.text === "string" && itemRecord.text.trim()) {
      parts.push(itemRecord.text.trim());
    }

    if (typeof itemRecord.output_text === "string" && itemRecord.output_text.trim()) {
      parts.push(itemRecord.output_text.trim());
    }

    if (typeof itemRecord.content === "string" && itemRecord.content.trim()) {
      parts.push(itemRecord.content.trim());
      continue;
    }

    const content = Array.isArray(itemRecord.content) ? itemRecord.content : [];

    for (const contentItem of content) {
      if (typeof contentItem === "string" && contentItem.trim()) {
        parts.push(contentItem.trim());
        continue;
      }

      if (!contentItem || typeof contentItem !== "object") {
        continue;
      }

      const contentRecord = contentItem as Record<string, unknown>;
      const text = typeof contentRecord.text === "string"
        ? contentRecord.text
        : typeof contentRecord.output_text === "string"
          ? contentRecord.output_text
          : "";

      if (text.trim()) {
        parts.push(text.trim());
      }
    }
  }

  return parts.join("\n").trim();
}

function readStringArray(value: unknown, limit = 8) {
  return Array.isArray(value)
    ? value.map((item) => readString(item)).filter(Boolean).slice(0, limit)
    : [];
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
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    try {
      return JSON.parse(extractJsonText(text)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

export function extractRawGptReplyMarkdown(text: string) {
  const parsed = parseMaybeJson(text);

  if (parsed) {
    const replyMarkdown = parsed.replyMarkdown;

    return typeof replyMarkdown === "string" && replyMarkdown.trim()
      ? replyMarkdown
      : "";
  }

  return text.trim() ? text : "";
}

function collectStringValues(value: unknown, depth = 0): string[] {
  if (depth > 4) {
    return [];
  }

  if (typeof value === "string") {
    return [value.trim()].filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStringValues(item, depth + 1));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  return Object.values(value as Record<string, unknown>).flatMap((item) => collectStringValues(item, depth + 1));
}

function readLikelyReplyMarkdown(parsed: Record<string, unknown> | null) {
  if (!parsed) {
    return "";
  }

  const preferred = [
    parsed.replyMarkdown,
    parsed.markdown,
    parsed.mainReply,
    parsed.reply,
    parsed.answer,
    parsed.content,
    parsed.message,
    parsed.result,
    parsed.summaryMarkdown
  ].map(readString).find((value) => value.length > 200);

  if (preferred) {
    return preferred;
  }

  return collectStringValues(parsed)
    .filter((value) => value.length > 300)
    .filter((value) => /[\u3400-\u9fff]/.test(value))
    .filter((value) => !value.trim().startsWith("{"))
    .sort((left, right) => right.length - left.length)[0] ?? "";
}

function extractMarkdownBody(text: string) {
  const trimmed = text.trim();

  if (!trimmed || trimmed.startsWith("{")) {
    return "";
  }

  return trimmed.replace(/^```(?:markdown)?\s*/i, "").replace(/```$/g, "").trim();
}

export function normalizeGptOutput(input: {
  rawText: string;
  originalInput: string;
  fallbackCategory: string;
  strictReply?: boolean;
}): NormalizedGptOutput {
  const parsed = parseMaybeJson(input.rawText);
  const knowledgeDraft = enrichDraftWithKnowledgeFactoryV5(normalizeGptKnowledgeDraft({
    parsed,
    originalInput: input.originalInput,
    fallbackCategory: input.fallbackCategory
  }), {
    text: input.originalInput,
    category: input.fallbackCategory
  });
  const parsedQuestions = readStringArray(parsed?.suggestedQuestions ?? parsed?.followUpQuestions);
  const suggestedQuestions = parsedQuestions.length > 0
    ? parsedQuestions
    : knowledgeDraft.missingFields.length > 0
      ? knowledgeDraft.missingFields.map((field) => `请补充：${field}`)
      : [
        "这个知识点最常出现在哪类客户场景？",
        "是否有价格、售后或使用边界需要补充？",
        "有没有真实案例可以强化用户端回答？"
      ];
  const diagnostics = readStringArray(parsed?.diagnostics, 6);
  const fallbackCallPlan = buildFallbackUserClientCallPlan({
    category: knowledgeDraft.category,
    tags: knowledgeDraft.tags,
    standardQuestion: knowledgeDraft.standardQuestion,
    standardAnswer: knowledgeDraft.standardAnswer
  });
  const userClientCallPlan = normalizeUserClientCallPlan(parsed?.userClientCallPlan, fallbackCallPlan);
  knowledgeDraft.userClientCallPlan = userClientCallPlan;
  const structured = knowledgeDraftToStructured({
    draft: knowledgeDraft,
    followUpQuestions: suggestedQuestions
  });
  const rawMarkdown = parsed ? "" : extractMarkdownBody(input.rawText);
  const replyMarkdownCandidate = readString(parsed?.replyMarkdown)
    || readLikelyReplyMarkdown(parsed)
    || rawMarkdown;

  if (input.strictReply && !replyMarkdownCandidate) {
    throw new Error("OpenAI Responses API 未返回 replyMarkdown。");
  }

  const visibleReplyMarkdown = replyMarkdownCandidate || buildNaturalFallbackReply({
    originalInput: input.originalInput,
    draft: knowledgeDraft,
    suggestedQuestions
  });
  const replyMarkdown = processAIOutput(visibleReplyMarkdown, {
    source: "gpt_output_normalizer",
    mode: input.strictReply ? "strict_reply" : "standard_reply"
  }).output;

  return {
    replyMarkdown,
    knowledgeDraft,
    suggestedQuestions,
    saveRecommendation: knowledgeDraft.saveRecommendation,
    userClientCallPlan,
    diagnostics,
    structured
  };
}
