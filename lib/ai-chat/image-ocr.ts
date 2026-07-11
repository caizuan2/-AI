import { logger, toSafeErrorLog } from "@/lib/logger";
import {
  getOpenAIBaseUrl,
  getQwenBaseUrl,
  hasUsableOpenAIKey,
  hasUsableQwenKey
} from "@/lib/server-config-core";

export type ChatImageOcrStatus =
  | "ok"
  | "unavailable"
  | "skipped_non_image"
  | "skipped_large"
  | "failed";

export interface ChatImageOcrResult {
  status: ChatImageOcrStatus;
  text: string;
  provider?: "qwen" | "openai";
  model?: string;
}

interface VisionProviderConfig {
  name: "qwen" | "openai";
  apiKey: string;
  baseUrl: string;
  model: string;
}

const DEFAULT_MAX_IMAGE_OCR_BYTES = 8 * 1024 * 1024;
const DEFAULT_IMAGE_OCR_TIMEOUT_MS = 15_000;
const MAX_OCR_METADATA_CHARS = 2200;
const OCR_PROMPT = [
  "请只识别这张微信截图或客户截图中的可见文字。",
  "保留客户原话、昵称、订单号、金额、时间等关键信息。",
  "如果是微信/聊天截图，请按画面从上到下输出每条气泡文字，并尽量保留左右角色。",
  "角色规则必须固定：左侧头像/白色气泡=客户，右侧头像/绿色气泡=我/用户。",
  "输出格式优先使用：客户(左侧)：原话；我(右侧)：原话。不要把右侧绿色气泡当成客户说的话。",
  "如果某条消息左右位置看不清，再标注为角色不确定，不要猜测。",
  "不要总结，不要分析，不要编造。没有可识别文字时只返回空字符串。"
].join("\n");

function readPositiveNumberEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  const parsed = raw ? Number(raw) : NaN;

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function chatCompletionsUrl(baseUrl: string) {
  return `${normalizeBaseUrl(baseUrl)}/chat/completions`;
}

function preferredOcrProvider() {
  const preferred = process.env.CHAT_IMAGE_OCR_PROVIDER?.trim().toLowerCase();

  return preferred === "openai" || preferred === "qwen" ? preferred : null;
}

function readVisionProviders(): VisionProviderConfig[] {
  const providers: VisionProviderConfig[] = [];
  const qwenApiKey = process.env.QWEN_API_KEY?.trim();
  const openAiApiKey = process.env.OPENAI_API_KEY?.trim();

  if (qwenApiKey && hasUsableQwenKey()) {
    providers.push({
      name: "qwen",
      apiKey: qwenApiKey,
      baseUrl: getQwenBaseUrl(),
      model:
        process.env.QWEN_VISION_MODEL?.trim() ||
        process.env.CHAT_IMAGE_OCR_MODEL?.trim() ||
        "qwen-vl-plus"
    });
  }

  if (openAiApiKey && hasUsableOpenAIKey()) {
    providers.push({
      name: "openai",
      apiKey: openAiApiKey,
      baseUrl: getOpenAIBaseUrl(),
      model:
        process.env.OPENAI_VISION_MODEL?.trim() ||
        process.env.CHAT_IMAGE_OCR_OPENAI_MODEL?.trim() ||
        process.env.CHAT_IMAGE_OCR_MODEL?.trim() ||
        "gpt-4o-mini"
    });
  }

  const preferred = preferredOcrProvider();

  if (!preferred) {
    return providers;
  }

  return providers.sort((left, right) => {
    if (left.name === preferred) {
      return -1;
    }

    if (right.name === preferred) {
      return 1;
    }

    return 0;
  });
}

function readContentText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (part && typeof part === "object" && "text" in part) {
          const text = (part as { text?: unknown }).text;

          return typeof text === "string" ? text : "";
        }

        return "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

function normalizeOcrText(value: string) {
  return value
    .replace(/^```[\w-]*\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, MAX_OCR_METADATA_CHARS);
}

async function callVisionProvider(input: {
  provider: VisionProviderConfig;
  dataUrl: string;
  signal: AbortSignal;
}) {
  const response = await fetch(chatCompletionsUrl(input.provider.baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.provider.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: input.provider.model,
      temperature: 0,
      max_tokens: 1200,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: OCR_PROMPT
            },
            {
              type: "image_url",
              image_url: {
                url: input.dataUrl
              }
            }
          ]
        }
      ]
    }),
    signal: input.signal
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`OCR provider ${input.provider.name} failed: ${response.status} ${responseText.slice(0, 160)}`);
  }

  const payload = JSON.parse(responseText) as {
    choices?: Array<{
      message?: {
        content?: unknown;
      };
    }>;
  };

  return normalizeOcrText(readContentText(payload.choices?.[0]?.message?.content));
}

export async function extractChatImageText(input: {
  arrayBuffer: ArrayBuffer;
  filename: string;
  mimeType: string;
}): Promise<ChatImageOcrResult> {
  if (!input.mimeType.startsWith("image/")) {
    return {
      status: "skipped_non_image",
      text: ""
    };
  }

  const maxBytes = readPositiveNumberEnv("CHAT_IMAGE_OCR_MAX_BYTES", DEFAULT_MAX_IMAGE_OCR_BYTES);

  if (input.arrayBuffer.byteLength > maxBytes) {
    return {
      status: "skipped_large",
      text: ""
    };
  }

  const providers = readVisionProviders();

  if (providers.length === 0) {
    return {
      status: "unavailable",
      text: ""
    };
  }

  const dataUrl = `data:${input.mimeType};base64,${Buffer.from(input.arrayBuffer).toString("base64")}`;
  const timeoutMs = readPositiveNumberEnv("CHAT_IMAGE_OCR_TIMEOUT_MS", DEFAULT_IMAGE_OCR_TIMEOUT_MS);

  for (const provider of providers) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const text = await callVisionProvider({
        provider,
        dataUrl,
        signal: controller.signal
      });

      if (text) {
        return {
          status: "ok",
          text,
          provider: provider.name,
          model: provider.model
        };
      }
    } catch (error) {
      logger.warn("chat_attachment.ocr_failed", {
        filename: input.filename,
        mimeType: input.mimeType,
        provider: provider.name,
        model: provider.model,
        error: toSafeErrorLog(error)
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    status: "failed",
    text: ""
  };
}

export function createChatImageOcrMetadata(result: ChatImageOcrResult): Record<string, string> {
  if (result.status === "skipped_non_image") {
    return {};
  }

  return {
    ocrStatus: result.status,
    ...(result.text ? { ocrText: result.text } : {}),
    ...(result.provider ? { ocrProvider: result.provider } : {}),
    ...(result.model ? { ocrModel: result.model } : {})
  };
}
