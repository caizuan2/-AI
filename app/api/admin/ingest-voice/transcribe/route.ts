import { apiError, apiSuccess } from "@/lib/api-response";
import { AppError, ValidationError } from "@/lib/errors";
import { requireAdminIngestChatActor } from "@/lib/enterprise/admin-ingest-auth";
import { matchesAdminIngestHistoryScope } from "@/lib/enterprise/admin-ingest-history-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ADMIN_INGEST_VOICE_BYTES = 2 * 1024 * 1024;
const ADMIN_INGEST_VOICE_TIMEOUT_MS = 45_000;
const DEFAULT_QWEN_ASR_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_QWEN_ASR_MODEL = "qwen3-asr-flash";
const ALLOWED_AUDIO_MIME_TYPES = new Set([
  "audio/aac",
  "audio/m4a",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
  "video/mp4"
]);

type QwenAsrResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    code?: string;
    message?: string;
  };
  message?: string;
};

function normalizeAudioMimeType(file: File) {
  const mimeType = file.type.trim().toLowerCase();

  if (!ALLOWED_AUDIO_MIME_TYPES.has(mimeType)) {
    throw new ValidationError("语音文件格式不受支持，请重新录制。");
  }

  return mimeType;
}

function getQwenAsrConfig() {
  const apiKey = process.env.QWEN_API_KEY?.trim()
    || process.env.DASHSCOPE_API_KEY?.trim();

  if (!apiKey) {
    throw new AppError(
      "MISSING_QWEN_API_KEY",
      "管理员语音转文字服务尚未配置，请联系管理员。",
      500
    );
  }

  const rawBaseUrl = process.env.QWEN_ASR_BASE_URL?.trim()
    || process.env.QWEN_BASE_URL?.trim()
    || DEFAULT_QWEN_ASR_BASE_URL;
  let baseUrl: URL;

  try {
    baseUrl = new URL(rawBaseUrl);
  } catch {
    throw new AppError(
      "CONFIG_ERROR",
      "管理员语音转文字服务地址配置无效，请联系管理员。",
      500
    );
  }

  if (baseUrl.protocol !== "https:") {
    throw new AppError(
      "CONFIG_ERROR",
      "管理员语音转文字服务必须使用 HTTPS。",
      500
    );
  }

  const normalizedBaseUrl = baseUrl.toString().replace(/\/+$/, "");
  const endpoint = normalizedBaseUrl.endsWith("/chat/completions")
    ? normalizedBaseUrl
    : `${normalizedBaseUrl}/chat/completions`;

  return {
    apiKey,
    endpoint,
    model: process.env.QWEN_ASR_MODEL?.trim() || DEFAULT_QWEN_ASR_MODEL
  };
}

function readQwenAsrTranscript(payload: QwenAsrResponse) {
  const content = payload.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((item) => item.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

async function transcribeWithQwenAsr(
  audioBytes: Uint8Array,
  mimeType: string
) {
  const config = getQwenAsrConfig();
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    ADMIN_INGEST_VOICE_TIMEOUT_MS
  );
  let response: Response;

  try {
    response = await fetch(config.endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "input_audio",
                input_audio: {
                  data: `data:${mimeType};base64,${Buffer.from(audioBytes).toString("base64")}`
                }
              }
            ]
          }
        ],
        stream: false,
        asr_options: {
          language: "zh",
          enable_itn: true
        }
      })
    });
  } catch {
    if (controller.signal.aborted) {
      throw new AppError(
        "QWEN_REQUEST_FAILED",
        "语音转写等待超时，请检查网络后重试。",
        504
      );
    }

    throw new AppError(
      "QWEN_REQUEST_FAILED",
      "语音转文字服务暂时不可用，请稍后重试。",
      502
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = await response.json().catch(() => ({})) as QwenAsrResponse;

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new AppError(
        "MISSING_QWEN_API_KEY",
        "管理员语音转文字服务配置无效，请联系管理员。",
        500
      );
    }

    if (response.status === 429) {
      throw new AppError(
        "AI_RATE_LIMITED",
        "语音请求过于频繁，请稍后再试。",
        429
      );
    }

    throw new AppError(
      "QWEN_REQUEST_FAILED",
      "语音转文字服务暂时不可用，请稍后重试。",
      502
    );
  }

  return readQwenAsrTranscript(payload);
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdminIngestChatActor();

    if (
      !matchesAdminIngestHistoryScope(
        actor.id,
        request.headers.get("x-admin-ingest-history-scope")
      )
    ) {
      throw new AppError(
        "FORBIDDEN",
        "账号已切换，旧页面不能继续使用当前账号。",
        409
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new ValidationError("没有收到语音录音，请重新录制。");
    }

    if (file.size <= 0) {
      throw new ValidationError("语音录音为空，请重新录制。");
    }

    if (file.size > MAX_ADMIN_INGEST_VOICE_BYTES) {
      throw new AppError("VALIDATION_ERROR", "语音录音过长，请缩短后重试。", 413);
    }

    const mimeType = normalizeAudioMimeType(file);
    const audioBytes = new Uint8Array(await file.arrayBuffer());
    const transcript = await transcribeWithQwenAsr(audioBytes, mimeType);

    if (!transcript) {
      throw new ValidationError("没有识别到语音内容，请靠近麦克风后重试。");
    }

    return apiSuccess(
      { transcript },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    return apiError(error, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  }
}
