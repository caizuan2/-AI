import "server-only";

import { AppError } from "@/lib/errors";
import { logger, toSafeErrorLog } from "@/lib/logger";
import {
  normalizeGptOutput,
  type GptStructuredKnowledge
} from "@/lib/enterprise/gpt-output-normalizer";
import type { AdminIngestPlatform } from "@/lib/enterprise/admin-ingest-app-config";
import { resolveHighestOpenAIModel } from "@/lib/enterprise/openai-model-resolver";

export interface OpenAIAdminIngestAttachment {
  fileName: string;
  fileType?: string;
  fileSize?: number;
  status?: string;
}

export interface OpenAIAdminIngestInput {
  input: string;
  attachments?: OpenAIAdminIngestAttachment[];
  agentId?: string | null;
  agentName?: string | null;
  category?: string | null;
  source: "admin_ingest";
  platform: AdminIngestPlatform;
  syncTarget: Array<"web" | "exe" | "apk">;
  tenantId?: string | null;
  userId?: string | null;
  preferredModel?: string | null;
  gptTier?: string | null;
  gptTierLabel?: string | null;
  gptVersion?: string | null;
  selectedModelLabel?: string | null;
  modelDisplayName?: string | null;
  requestId?: string;
}

export interface OpenAIAdminIngestResult {
  provider: "openai";
  model: string;
  modelDisplayName: string;
  modelMode: "highest" | "fixed";
  replyMarkdown: string;
  structured: GptStructuredKnowledge;
  sync: {
    platform: AdminIngestPlatform;
    syncTarget: Array<"web" | "exe" | "apk">;
  };
  sourceType: "admin_ingest";
  fallbackUsed: false;
}

const REQUEST_TIMEOUT_MS = 35_000;

function buildSystemPrompt() {
  return [
    "你是企业 AI 知识库投喂管理员的 GPT 助手。",
    "你的任务是先像 ChatGPT 一样自然、清晰、分段地回复管理员，再把内容整理成可保存到知识库的结构化结果。",
    "输出必须是一个 JSON 对象，不要使用 Markdown 代码围栏。",
    "JSON 字段必须包含：replyMarkdown, title, category, summary, tags, question, answer, confidence, saveSuggestion, followUpQuestions, sourceType, syncTarget。",
    "replyMarkdown 要使用自然段、标题、列表、加粗重点；不要空泛，要适合客服、销售、售后、制度、产品知识库沉淀。",
    "title/category/summary/tags/question/answer 要能直接用于知识库入库。",
    "confidence 为 0-100 的训练价值评分，saveSuggestion 为 boolean。",
    "sourceType 固定为 admin_ingest，syncTarget 固定为 [\"web\",\"exe\",\"apk\"]。"
  ].join("\n");
}

function buildAttachmentSummary(attachments: OpenAIAdminIngestAttachment[] = []) {
  if (attachments.length === 0) {
    return "无附件。";
  }

  return attachments
    .map((file, index) => `${index + 1}. ${file.fileName} (${file.fileType || "unknown"}, ${file.fileSize ?? "size_unknown"} bytes, ${file.status || "ready"})`)
    .join("\n");
}

function buildUserPrompt(input: OpenAIAdminIngestInput) {
  return [
    `当前 Agent：${input.agentName || input.agentId || "默认 Agent"}`,
    `当前分类：${input.category || "默认知识库"}`,
    `当前 GPT 模型：${input.selectedModelLabel || input.modelDisplayName || input.preferredModel || "GPT-5.5 超高"}`,
    `当前 GPT 档位：${input.gptTierLabel || input.gptTier || "超高"}`,
    `当前 GPT 版本：${input.gptVersion || "5.5"}`,
    `来源：${input.source}`,
    `平台：${input.platform}`,
    `同步目标：${input.syncTarget.join(" / ")}`,
    "",
    "## 管理员投喂内容",
    input.input,
    "",
    "## 附件摘要",
    buildAttachmentSummary(input.attachments)
  ].join("\n");
}

function extractResponseText(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const record = payload as Record<string, unknown>;

  if (typeof record.output_text === "string") {
    return record.output_text.trim();
  }

  const output = Array.isArray(record.output) ? record.output : [];
  const parts: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const itemRecord = item as Record<string, unknown>;
    const content = Array.isArray(itemRecord.content) ? itemRecord.content : [];

    for (const contentItem of content) {
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

function normalizeOpenAIResponseError(status: number, bodyText: string) {
  const lower = bodyText.toLowerCase();

  if (status === 401 || status === 403) {
    return new AppError("MISSING_AI_API_KEY", "OpenAI API Key 未配置或无权访问当前模型。", 500);
  }

  if (status === 408 || lower.includes("timeout")) {
    return new AppError("OPENAI_REQUEST_FAILED", "GPT 请求超时，请稍后重试。", 504);
  }

  if (status === 404 || lower.includes("model")) {
    return new AppError("OPENAI_REQUEST_FAILED", "当前 GPT 模型不可用，正在尝试 fallback 模型。", 502);
  }

  return new AppError("OPENAI_REQUEST_FAILED", "GPT 接口暂不可用，已使用本地预览结果。", 502);
}

async function callResponsesApi(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  signal: AbortSignal;
}) {
  const response = await fetch(`${input.baseUrl}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: input.model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: input.systemPrompt
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: input.userPrompt
            }
          ]
        }
      ],
      max_output_tokens: 1800
    }),
    signal: input.signal,
    cache: "no-store"
  });
  const bodyText = await response.text();

  if (!response.ok) {
    throw normalizeOpenAIResponseError(response.status, bodyText);
  }

  const payload = bodyText ? JSON.parse(bodyText) as unknown : null;
  const text = extractResponseText(payload);

  if (!text) {
    throw new AppError("OPENAI_REQUEST_FAILED", "OpenAI 返回了空内容。", 502);
  }

  return {
    text,
    model: typeof (payload as { model?: unknown } | null)?.model === "string"
      ? (payload as { model: string }).model
      : input.model
  };
}

export async function runOpenAIAdminIngest(input: OpenAIAdminIngestInput): Promise<OpenAIAdminIngestResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const resolved = await resolveHighestOpenAIModel({
      preferredModel: input.preferredModel,
      signal: controller.signal
    });
    const candidates = resolved.mode === "fixed" ? [resolved.model] : resolved.candidates;
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(input);
    let lastError: unknown;

    for (const model of candidates) {
      try {
        const response = await callResponsesApi({
          baseUrl: resolved.baseUrl,
          apiKey: resolved.apiKey,
          model,
          systemPrompt,
          userPrompt,
          signal: controller.signal
        });
        const normalized = normalizeGptOutput({
          rawText: response.text,
          originalInput: input.input,
          fallbackCategory: input.category ?? ""
        });

        logger.info("enterprise_admin_ingest.openai_success", {
          requestId: input.requestId,
          model: response.model,
          modelMode: resolved.mode,
          durationMs: Date.now() - startedAt,
          availableModelsChecked: resolved.availableModelsChecked
        });

        return {
          provider: "openai",
          model: response.model,
          modelDisplayName: input.selectedModelLabel || input.modelDisplayName || resolved.displayName,
          modelMode: resolved.mode === "fixed" ? "fixed" : "highest",
          replyMarkdown: normalized.replyMarkdown,
          structured: normalized.structured,
          sync: {
            platform: input.platform,
            syncTarget: input.syncTarget
          },
          sourceType: "admin_ingest",
          fallbackUsed: false
        };
      } catch (error) {
        lastError = error;
        logger.warn("enterprise_admin_ingest.openai_model_fallback", {
          requestId: input.requestId,
          model,
          error: toSafeErrorLog(error)
        });
      }
    }

    throw lastError ?? new AppError("OPENAI_REQUEST_FAILED", "GPT 接口暂不可用，已使用本地预览结果。", 502);
  } catch (error) {
    if (error && typeof error === "object" && (error as { name?: string }).name === "AbortError") {
      throw new AppError("OPENAI_REQUEST_FAILED", "GPT 请求超时，请稍后重试。", 504);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
