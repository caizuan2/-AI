import { logger, toSafeErrorLog } from "@/lib/logger";
import {
  getOpenAIBaseUrl,
  getQwenBaseUrl,
  hasUsableOpenAIKey,
  hasUsableQwenKey
} from "@/lib/server-config-core";
import type { Metadata } from "sharp";

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
  strategy?: "vertical_segments_v1";
  segmentCount?: number;
  recognizedSegmentCount?: number;
}

interface VisionProviderConfig {
  name: "qwen" | "openai";
  apiKey: string;
  baseUrl: string;
  model: string;
}

interface PreparedOcrSegment {
  dataUrl: string;
  index: number;
  total: number;
}

interface PreparedOcrInput {
  segments: PreparedOcrSegment[];
  strategy?: "vertical_segments_v1";
}

interface SegmentOcrResult {
  index: number;
  text: string;
  provider: VisionProviderConfig;
}

class VisionProviderHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "VisionProviderHttpError";
  }
}

const DEFAULT_MAX_IMAGE_OCR_BYTES = 8 * 1024 * 1024;
const DEFAULT_IMAGE_OCR_TIMEOUT_MS = 15_000;
const DEFAULT_LONG_IMAGE_OCR_TIMEOUT_MS = 25_000;
const DEFAULT_LONG_IMAGE_OCR_TOTAL_TIMEOUT_MS = 75_000;
const LONG_IMAGE_MIN_HEIGHT = 3_000;
const LONG_IMAGE_MIN_ASPECT_RATIO = 3;
const LONG_IMAGE_MAX_PIXELS = 40_000_000;
const LONG_IMAGE_TARGET_SEGMENT_HEIGHT = 2_400;
const LONG_IMAGE_SEGMENT_OVERLAP = 360;
const LONG_IMAGE_MAX_SEGMENTS = 10;
const LONG_IMAGE_SEGMENT_CONCURRENCY = 3;
const MAX_SINGLE_IMAGE_OCR_CHARS = 2_200;
const MAX_LONG_IMAGE_SEGMENT_OCR_CHARS = 2_400;
const MAX_LONG_IMAGE_MERGED_OCR_CHARS = 8_000;
const LONG_IMAGE_OCR_STRATEGY = "vertical_segments_v1" as const;
const OCR_PROMPT = [
  "请只识别这张微信截图或客户截图中的可见文字。",
  "保留客户原话、昵称、订单号、金额、时间等关键信息。",
  "如果是微信/聊天截图，请按画面从上到下输出每条气泡文字，并尽量保留左右角色。",
  "角色规则必须固定：左侧头像/白色气泡=客户，右侧头像/绿色气泡=我/用户。",
  "输出格式优先使用：客户(左侧)：原话；我(右侧)：原话。不要把右侧绿色气泡当成客户说的话。",
  "如果某条消息左右位置看不清，再标注为角色不确定，不要猜测。",
  "不要总结，不要分析，不要编造。没有可识别文字时只返回空字符串。"
].join("\n");

function longImageOcrPrompt(index: number, total: number) {
  return [
    OCR_PROMPT,
    "",
    `这是同一张纵向长截图的第 ${index + 1}/${total} 段，相邻片段有少量重叠。`,
    "每个可辨认气泡单独一行；边缘裁断的气泡也只抄写实际可见部分，并在末尾标注[截断]。",
    "顶部或底部被裁断的文字不要猜测、补全或改写。相邻片段完整显示后会自动替代裁断内容。",
    "继续严格使用客户(左侧)与我(右侧)标签，后续程序会按片段顺序合并并去除边界重复。"
  ].join("\n");
}

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

function normalizeOcrText(value: string, maxChars: number) {
  return value
    .replace(/^```[\w-]*\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, maxChars);
}

async function callVisionProvider(input: {
  provider: VisionProviderConfig;
  dataUrl: string;
  prompt: string;
  maxTokens: number;
  maxChars: number;
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
      max_tokens: input.maxTokens,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: input.prompt
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
    throw new VisionProviderHttpError(
      `OCR provider ${input.provider.name} failed: ${response.status} ${responseText.slice(0, 160)}`,
      response.status,
    );
  }

  const payload = JSON.parse(responseText) as {
    choices?: Array<{
      message?: {
        content?: unknown;
      };
    }>;
  };

  return normalizeOcrText(
    readContentText(payload.choices?.[0]?.message?.content),
    input.maxChars,
  );
}

function createDataUrl(buffer: Buffer, mimeType: string) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function orientedImageDimensions(metadata: Metadata) {
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const swapsAxes = metadata.orientation !== undefined
    && metadata.orientation >= 5
    && metadata.orientation <= 8;

  return swapsAxes
    ? { width: height, height: width }
    : { width, height };
}

function shouldSegmentLongImage(width: number, height: number) {
  if (width <= 0 || height <= 0) {
    return false;
  }

  return height >= LONG_IMAGE_MIN_HEIGHT
    && height / width >= LONG_IMAGE_MIN_ASPECT_RATIO;
}

async function loadSharp() {
  const sharpModule = await import("sharp");

  return sharpModule.default;
}

function calculateVerticalSegments(height: number) {
  const stride = LONG_IMAGE_TARGET_SEGMENT_HEIGHT - LONG_IMAGE_SEGMENT_OVERLAP;
  const requestedCount = Math.max(
    2,
    Math.ceil((height - LONG_IMAGE_SEGMENT_OVERLAP) / stride),
  );
  const count = Math.min(LONG_IMAGE_MAX_SEGMENTS, requestedCount);
  const segmentHeight = Math.ceil(
    (height + LONG_IMAGE_SEGMENT_OVERLAP * (count - 1)) / count,
  );
  const segmentStride = segmentHeight - LONG_IMAGE_SEGMENT_OVERLAP;

  return Array.from({ length: count }, (_, index) => {
    const top = Math.min(index * segmentStride, Math.max(0, height - 1));

    return {
      top,
      height: Math.min(segmentHeight, height - top),
    };
  }).filter((segment) => segment.height > 0);
}

async function prepareOcrInput(input: {
  arrayBuffer: ArrayBuffer;
  filename: string;
  mimeType: string;
}): Promise<PreparedOcrInput> {
  const sourceBuffer = Buffer.from(input.arrayBuffer);
  const singleImageInput: PreparedOcrInput = {
    segments: [{
      dataUrl: createDataUrl(sourceBuffer, input.mimeType),
      index: 0,
      total: 1,
    }],
  };

  try {
    const sharp = await loadSharp();
    const metadata = await sharp(sourceBuffer, {
      animated: false,
      limitInputPixels: LONG_IMAGE_MAX_PIXELS,
    }).metadata();
    const { width, height } = orientedImageDimensions(metadata);

    if ((metadata.pages ?? 1) > 1 || !shouldSegmentLongImage(width, height)) {
      return singleImageInput;
    }

    if (width * height > LONG_IMAGE_MAX_PIXELS) {
      logger.warn("chat_attachment.long_image_pixel_limit", {
        filename: input.filename,
        mimeType: input.mimeType,
        width,
        height,
        maxPixels: LONG_IMAGE_MAX_PIXELS,
      });
      return singleImageInput;
    }

    const slicePlan = calculateVerticalSegments(height);

    if (slicePlan.length < 2) {
      return singleImageInput;
    }

    const segments: PreparedOcrSegment[] = [];

    for (let index = 0; index < slicePlan.length; index += 1) {
      const slice = slicePlan[index];
      const sliceBuffer = await sharp(sourceBuffer, {
        animated: false,
        limitInputPixels: LONG_IMAGE_MAX_PIXELS,
      })
        .rotate()
        .extract({
          left: 0,
          top: slice.top,
          width,
          height: slice.height,
        })
        .flatten({ background: "#ffffff" })
        .png({ compressionLevel: 6 })
        .toBuffer();

      segments.push({
        dataUrl: createDataUrl(sliceBuffer, "image/png"),
        index,
        total: slicePlan.length,
      });
    }

    logger.info("chat_attachment.long_image_segmented", {
      filename: input.filename,
      mimeType: input.mimeType,
      width,
      height,
      segmentCount: segments.length,
    });

    return {
      strategy: LONG_IMAGE_OCR_STRATEGY,
      segments,
    };
  } catch (error) {
    logger.warn("chat_attachment.long_image_prepare_failed", {
      filename: input.filename,
      mimeType: input.mimeType,
      error: toSafeErrorLog(error),
    });

    return singleImageInput;
  }
}

function isFatalProviderError(error: unknown) {
  return error instanceof VisionProviderHttpError
    && (error.status === 401 || error.status === 403);
}

async function recognizeSegment(input: {
  provider: VisionProviderConfig;
  segment: PreparedOcrSegment;
  timeoutMs: number;
  filename: string;
  mimeType: string;
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    return await callVisionProvider({
      provider: input.provider,
      dataUrl: input.segment.dataUrl,
      prompt: longImageOcrPrompt(input.segment.index, input.segment.total),
      maxTokens: 1_600,
      maxChars: MAX_LONG_IMAGE_SEGMENT_OCR_CHARS,
      signal: controller.signal,
    });
  } catch (error) {
    logger.warn("chat_attachment.ocr_segment_failed", {
      filename: input.filename,
      mimeType: input.mimeType,
      provider: input.provider.name,
      model: input.provider.model,
      segmentIndex: input.segment.index,
      segmentCount: input.segment.total,
      error: toSafeErrorLog(error),
    });
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function runProviderForSegments(input: {
  provider: VisionProviderConfig;
  segments: PreparedOcrSegment[];
  results: Array<SegmentOcrResult | null>;
  timeoutMs: number;
  deadline: number;
  filename: string;
  mimeType: string;
}) {
  const pending = input.segments
    .filter((segment) => !input.results[segment.index])
    .sort((left, right) => {
      const lastIndex = input.segments.length - 1;

      if (left.index === lastIndex) {
        return -1;
      }

      if (right.index === lastIndex) {
        return 1;
      }

      return left.index - right.index;
    });
  let cursor = 0;
  let providerDisabled = false;

  async function worker() {
    while (!providerDisabled) {
      const segment = pending[cursor];
      cursor += 1;

      if (!segment) {
        return;
      }

      const remainingMs = input.deadline - Date.now();

      if (remainingMs <= 0) {
        return;
      }

      try {
        const text = await recognizeSegment({
          provider: input.provider,
          segment,
          timeoutMs: Math.max(1, Math.min(input.timeoutMs, remainingMs)),
          filename: input.filename,
          mimeType: input.mimeType,
        });

        if (text) {
          input.results[segment.index] = {
            index: segment.index,
            text,
            provider: input.provider,
          };
        }
      } catch (error) {
        if (isFatalProviderError(error)) {
          providerDisabled = true;
        }
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(LONG_IMAGE_SEGMENT_CONCURRENCY, pending.length) },
      () => worker(),
    ),
  );
}

function normalizeBoundaryLine(value: string) {
  return value
    .trim()
    .replace(/[：:]/g, ":")
    .replace(/\s+/g, " ");
}

function mergeAdjacentSegmentText(parts: Array<string | null>) {
  const mergedLines: string[] = [];

  parts.forEach((part, index) => {
    if (!part) {
      mergedLines.push(`[长截图第 ${index + 1}/${parts.length} 段未识别，对话可能不完整]`);
      return;
    }

    const nextLines = part
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const maxOverlap = Math.min(12, mergedLines.length, nextLines.length);
    let overlap = 0;

    for (let size = maxOverlap; size > 0; size -= 1) {
      const previousBoundary = mergedLines
        .slice(-size)
        .map(normalizeBoundaryLine);
      const nextBoundary = nextLines
        .slice(0, size)
        .map(normalizeBoundaryLine);

      if (previousBoundary.every((line, lineIndex) => line === nextBoundary[lineIndex])) {
        overlap = size;
        break;
      }
    }

    mergedLines.push(...nextLines.slice(overlap));
  });

  return preserveTextEdges(
    mergedLines.join("\n"),
    MAX_LONG_IMAGE_MERGED_OCR_CHARS,
  );
}

function preserveTextEdges(value: string, maxChars: number) {
  const text = value.trim();

  if (text.length <= maxChars) {
    return text;
  }

  const marker = "\n[长截图中间部分因长度限制已省略]\n";
  const remaining = maxChars - marker.length;
  const headLength = Math.floor(remaining * 0.35);
  const tailLength = Math.max(0, remaining - headLength);

  return `${text.slice(0, headLength).trimEnd()}${marker}${text.slice(-tailLength).trimStart()}`;
}

async function extractLongImageText(input: {
  prepared: PreparedOcrInput;
  providers: VisionProviderConfig[];
  filename: string;
  mimeType: string;
  startedAt: number;
}): Promise<ChatImageOcrResult> {
  const timeoutMs = readPositiveNumberEnv(
    "CHAT_LONG_IMAGE_OCR_SEGMENT_TIMEOUT_MS",
    DEFAULT_LONG_IMAGE_OCR_TIMEOUT_MS,
  );
  const totalTimeoutMs = readPositiveNumberEnv(
    "CHAT_LONG_IMAGE_OCR_TOTAL_TIMEOUT_MS",
    DEFAULT_LONG_IMAGE_OCR_TOTAL_TIMEOUT_MS,
  );
  const deadline = input.startedAt + totalTimeoutMs;
  const results: Array<SegmentOcrResult | null> = Array.from(
    { length: input.prepared.segments.length },
    () => null,
  );

  for (let providerIndex = 0; providerIndex < input.providers.length; providerIndex += 1) {
    const provider = input.providers[providerIndex];
    const remainingMs = deadline - Date.now();

    if (remainingMs <= 0) {
      break;
    }

    const providerDeadline = providerIndex < input.providers.length - 1
      ? Math.min(deadline, Date.now() + Math.floor(remainingMs * 0.7))
      : deadline;

    await runProviderForSegments({
      provider,
      segments: input.prepared.segments,
      results,
      timeoutMs,
      deadline: providerDeadline,
      filename: input.filename,
      mimeType: input.mimeType,
    });

    if (results.every(Boolean) || Date.now() >= deadline) {
      break;
    }
  }

  const recognized = results.filter((result): result is SegmentOcrResult => Boolean(result));
  const lastSegmentRecognized = Boolean(results[results.length - 1]);

  if (recognized.length === 0 || !lastSegmentRecognized) {
    return {
      status: "failed",
      text: "",
      strategy: LONG_IMAGE_OCR_STRATEGY,
      segmentCount: results.length,
      recognizedSegmentCount: recognized.length,
    };
  }

  const first = recognized[0];

  return {
    status: "ok",
    text: mergeAdjacentSegmentText(results.map((result) => result?.text ?? null)),
    provider: first.provider.name,
    model: first.provider.model,
    strategy: LONG_IMAGE_OCR_STRATEGY,
    segmentCount: results.length,
    recognizedSegmentCount: recognized.length,
  };
}

async function extractSingleImageText(input: {
  prepared: PreparedOcrInput;
  providers: VisionProviderConfig[];
  filename: string;
  mimeType: string;
}): Promise<ChatImageOcrResult> {
  const segment = input.prepared.segments[0];
  const timeoutMs = readPositiveNumberEnv("CHAT_IMAGE_OCR_TIMEOUT_MS", DEFAULT_IMAGE_OCR_TIMEOUT_MS);

  for (const provider of input.providers) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const text = await callVisionProvider({
        provider,
        dataUrl: segment.dataUrl,
        prompt: OCR_PROMPT,
        maxTokens: 1_200,
        maxChars: MAX_SINGLE_IMAGE_OCR_CHARS,
        signal: controller.signal,
      });

      if (text) {
        return {
          status: "ok",
          text,
          provider: provider.name,
          model: provider.model,
        };
      }
    } catch (error) {
      logger.warn("chat_attachment.ocr_failed", {
        filename: input.filename,
        mimeType: input.mimeType,
        provider: provider.name,
        model: provider.model,
        error: toSafeErrorLog(error),
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    status: "failed",
    text: "",
  };
}

export async function extractChatImageText(input: {
  arrayBuffer: ArrayBuffer;
  filename: string;
  mimeType: string;
}): Promise<ChatImageOcrResult> {
  const startedAt = Date.now();

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

  const prepared = await prepareOcrInput(input);

  if (prepared.strategy === LONG_IMAGE_OCR_STRATEGY) {
    return extractLongImageText({
      prepared,
      providers,
      filename: input.filename,
      mimeType: input.mimeType,
      startedAt,
    });
  }

  return extractSingleImageText({
    prepared,
    providers,
    filename: input.filename,
    mimeType: input.mimeType,
  });
}

export function createChatImageOcrMetadata(result: ChatImageOcrResult): Record<string, string> {
  if (result.status === "skipped_non_image") {
    return {};
  }

  return {
    ocrStatus: result.status,
    ...(result.text ? { ocrText: result.text } : {}),
    ...(result.provider ? { ocrProvider: result.provider } : {}),
    ...(result.model ? { ocrModel: result.model } : {}),
    ...(result.strategy ? { ocrStrategy: result.strategy } : {}),
    ...(result.segmentCount !== undefined
      ? { ocrSegmentCount: String(result.segmentCount) }
      : {}),
    ...(result.recognizedSegmentCount !== undefined
      ? { ocrRecognizedSegmentCount: String(result.recognizedSegmentCount) }
      : {}),
    ...(result.segmentCount !== undefined
      && result.recognizedSegmentCount !== undefined
      && result.recognizedSegmentCount < result.segmentCount
      ? { ocrPartial: "true" }
      : {})
  };
}
