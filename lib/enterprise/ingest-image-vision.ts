import "server-only";

import { logger, toSafeErrorLog } from "@/lib/logger";
import {
  getOpenAIBaseUrl,
  getQwenBaseUrl,
  hasUsableOpenAIKey,
  hasUsableQwenKey
} from "@/lib/server-config-core";

export type AdminIngestVisionStatus =
  | "ok"
  | "unavailable"
  | "unsupported"
  | "skipped_large"
  | "failed";

export type AdminIngestVisionCode =
  | "VISION_OK"
  | "VISION_DISABLED"
  | "VISION_NO_PROVIDER"
  | "VISION_UNSUPPORTED_MEDIA"
  | "VISION_IMAGE_TOO_LARGE"
  | "VISION_EMPTY"
  | "VISION_PROVIDER_FAILED";

export interface AdminIngestVisionResult {
  status: AdminIngestVisionStatus;
  code: AdminIngestVisionCode;
  text: string;
  provider?: "qwen" | "openai";
  model?: string;
  truncated?: boolean;
}

interface AdminIngestVisionProvider {
  name: "qwen" | "openai";
  apiKey: string;
  baseUrl: string;
  model: string;
}

const DEFAULT_MAX_IMAGE_BYTES = 7 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_TOKENS = 3_000;
const MAX_VISION_TEXT_CHARS = 8_000;
const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/bmp"
]);

const ADMIN_INGEST_VISION_PROMPT = [
  "你是管理员投喂端的课件图片识别器。只识别当前这张图片，不得使用历史对话、文件名或常识补写图片中没有的内容。",
  "请完整保留可见标题、正文、数字、单位、步骤顺序、表格字段和图表标签；看不清的文字标记为【无法辨认】，不要猜测。",
  "如果图片包含流程、层级、箭头、表格或图表，请描述它们在画面中的明确关系，但不要进行课程总结或业务分析。",
  "请按以下结构输出：",
  "【可见文字】",
  "按画面从上到下逐行记录。",
  "【结构与图表】",
  "只描述图片中明确可见的结构关系；没有则写“无”。",
  "【不确定内容】",
  "列出模糊、遮挡或无法确认的部分；没有则写“无”。",
  "如果没有任何可识别内容，只返回：NO_VISIBLE_CONTENT"
].join("\n");

function readBoundedNumberEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);

  return Number.isFinite(value) && value > 0
    ? Math.min(max, Math.max(min, Math.floor(value)))
    : fallback;
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function buildChatCompletionsUrl(baseUrl: string) {
  const normalized = normalizeBaseUrl(baseUrl);

  return normalized.endsWith("/chat/completions")
    ? normalized
    : `${normalized}/chat/completions`;
}

function preferredProvider() {
  const preferred = process.env.ADMIN_INGEST_VISION_PROVIDER?.trim().toLowerCase();

  return preferred === "qwen" || preferred === "openai" ? preferred : null;
}

function allowProviderFallback() {
  return process.env.ADMIN_INGEST_VISION_ALLOW_PROVIDER_FALLBACK?.trim().toLowerCase() === "true";
}

function readProviders(): AdminIngestVisionProvider[] {
  const providers: AdminIngestVisionProvider[] = [];
  const qwenApiKey = process.env.QWEN_API_KEY?.trim();
  const openAiApiKey = process.env.OPENAI_API_KEY?.trim();

  if (qwenApiKey && hasUsableQwenKey()) {
    providers.push({
      name: "qwen",
      apiKey: qwenApiKey,
      baseUrl: getQwenBaseUrl(),
      model:
        process.env.ADMIN_INGEST_VISION_QWEN_MODEL?.trim()
        || process.env.ADMIN_INGEST_VISION_MODEL?.trim()
        || process.env.QWEN_VISION_MODEL?.trim()
        || "qwen-vl-plus"
    });
  }

  if (openAiApiKey && hasUsableOpenAIKey()) {
    providers.push({
      name: "openai",
      apiKey: openAiApiKey,
      baseUrl: getOpenAIBaseUrl(),
      model:
        process.env.ADMIN_INGEST_VISION_OPENAI_MODEL?.trim()
        || process.env.ADMIN_INGEST_VISION_MODEL?.trim()
        || process.env.OPENAI_VISION_MODEL?.trim()
        || "gpt-4o-mini"
    });
  }

  const preferred = preferredProvider();

  if (preferred) {
    const ordered = providers.sort((left, right) => left.name === preferred ? -1 : right.name === preferred ? 1 : 0);

    return allowProviderFallback()
      ? ordered
      : ordered.filter((provider) => provider.name === preferred);
  }

  return allowProviderFallback() ? providers : providers.slice(0, 1);
}

function providerSupportsMimeType(provider: AdminIngestVisionProvider["name"], mimeType: string) {
  if (mimeType === "image/png" || mimeType === "image/jpeg" || mimeType === "image/webp") {
    return true;
  }

  return provider === "openai" ? mimeType === "image/gif" : mimeType === "image/bmp";
}

function readContentText(content: unknown) {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content.map((part) => {
    if (typeof part === "string") {
      return part;
    }

    if (part && typeof part === "object" && "text" in part) {
      return typeof (part as { text?: unknown }).text === "string"
        ? (part as { text: string }).text
        : "";
    }

    return "";
  }).filter(Boolean).join("\n");
}

function normalizeVisionText(value: string) {
  const normalized = value
    .replace(/^```[\w-]*\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/\r\n?/g, "\n")
    .trim();

  if (/^(?:抱歉[，,。\s]*)?(?:我)?(?:无法|不能|未能)(?:查看|识别|读取|解析|处理).{0,40}(?:图片|图像|内容|文字)/.test(normalized)) {
    return { text: "", truncated: false };
  }

  const evidenceOnly = normalized
    .replace(/NO_VISIBLE_CONTENT/gi, "")
    .replace(/【(?:可见文字|结构与图表|不确定内容)】/g, "")
    .replace(/(?:没有任何可识别内容|未发现可见内容|无法识别任何内容|全部无法辨认|无法辨认|看不清|没有|无)/g, "")
    .replace(/[\s:：。；;，,、.\-—`"'“”‘’]/g, "");

  if (!evidenceOnly) {
    return { text: "", truncated: false };
  }

  return {
    text: normalized.slice(0, MAX_VISION_TEXT_CHARS),
    truncated: normalized.length > MAX_VISION_TEXT_CHARS
  };
}

async function callProvider(input: {
  provider: AdminIngestVisionProvider;
  dataUrl: string;
  contextLabel?: string;
  signal: AbortSignal;
  maxTokens: number;
}) {
  const prompt = input.contextLabel
    ? `${ADMIN_INGEST_VISION_PROMPT}\n\n当前图片位置：${input.contextLabel}`
    : ADMIN_INGEST_VISION_PROMPT;
  const response = await fetch(buildChatCompletionsUrl(input.provider.baseUrl), {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${input.provider.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: input.provider.model,
      temperature: 0,
      max_tokens: input.maxTokens,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: { url: input.dataUrl }
            }
          ]
        }
      ]
    }),
    signal: input.signal
  });
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`vision provider ${input.provider.name} failed: HTTP ${response.status}`);
  }

  const payload = JSON.parse(responseText) as {
    choices?: Array<{ finish_reason?: unknown; message?: { content?: unknown } }>;
  };
  const normalized = normalizeVisionText(readContentText(payload.choices?.[0]?.message?.content));
  const finishReason = typeof payload.choices?.[0]?.finish_reason === "string"
    ? payload.choices[0].finish_reason
    : "";

  return {
    ...normalized,
    truncated: normalized.truncated || Boolean(finishReason && finishReason !== "stop")
  };
}

export async function extractAdminIngestImageText(input: {
  bytes: Uint8Array;
  mimeType: string;
  contextLabel?: string;
  signal?: AbortSignal;
}): Promise<AdminIngestVisionResult> {
  const mimeType = input.mimeType.trim().toLowerCase();

  if (process.env.ADMIN_INGEST_VISION_ENABLED?.trim().toLowerCase() === "false") {
    return { status: "unavailable", code: "VISION_DISABLED", text: "" };
  }

  if (!SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) {
    return { status: "unsupported", code: "VISION_UNSUPPORTED_MEDIA", text: "" };
  }

  const maxBytes = readBoundedNumberEnv(
    "ADMIN_INGEST_VISION_MAX_BYTES",
    DEFAULT_MAX_IMAGE_BYTES,
    1024 * 1024,
    DEFAULT_MAX_IMAGE_BYTES
  );

  if (input.bytes.byteLength > maxBytes) {
    return { status: "skipped_large", code: "VISION_IMAGE_TOO_LARGE", text: "" };
  }

  const configuredProviders = readProviders();
  const providers = configuredProviders.filter((provider) => providerSupportsMimeType(provider.name, mimeType));

  if (providers.length === 0) {
    return {
      status: configuredProviders.length > 0 ? "unsupported" : "unavailable",
      code: configuredProviders.length > 0 ? "VISION_UNSUPPORTED_MEDIA" : "VISION_NO_PROVIDER",
      text: ""
    };
  }

  const dataUrl = `data:${mimeType};base64,${Buffer.from(input.bytes).toString("base64")}`;
  const timeoutMs = readBoundedNumberEnv("ADMIN_INGEST_VISION_TIMEOUT_MS", DEFAULT_TIMEOUT_MS, 3_000, 60_000);
  const maxTokens = readBoundedNumberEnv("ADMIN_INGEST_VISION_MAX_TOKENS", DEFAULT_MAX_TOKENS, 500, 4_000);
  let receivedEmptyResponse = false;

  for (const provider of providers) {
    if (input.signal?.aborted) {
      break;
    }

    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    input.signal?.addEventListener("abort", abortFromCaller, { once: true });

    try {
      const result = await callProvider({
        provider,
        dataUrl,
        contextLabel: input.contextLabel,
        signal: controller.signal,
        maxTokens
      });

      if (result.text) {
        return {
          status: "ok",
          code: "VISION_OK",
          text: result.text,
          provider: provider.name,
          model: provider.model,
          truncated: result.truncated
        };
      }

      receivedEmptyResponse = true;
    } catch (error) {
      logger.warn("admin_ingest_attachment.vision_failed", {
        mimeType,
        provider: provider.name,
        model: provider.model,
        error: toSafeErrorLog(error)
      });
    } finally {
      clearTimeout(timeoutId);
      input.signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  return {
    status: "failed",
    code: receivedEmptyResponse ? "VISION_EMPTY" : "VISION_PROVIDER_FAILED",
    text: ""
  };
}
