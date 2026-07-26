import { apiError, apiSuccess } from "@/lib/api-response";
import { AppError, ValidationError } from "@/lib/errors";
import { requireAdminIngestChatActor } from "@/lib/enterprise/admin-ingest-auth";
import { matchesAdminIngestHistoryScope } from "@/lib/enterprise/admin-ingest-history-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ADMIN_INGEST_VOICE_TRANSCRIPT_CHARS = 4000;
const ADMIN_INGEST_VOICE_REFINEMENT_TIMEOUT_MS = 30_000;
const DEFAULT_QWEN_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_QWEN_REFINEMENT_MODEL = "qwen-plus";
const ADMIN_INGEST_VOICE_REFINEMENT_SYSTEM_PROMPT = [
  "你只负责整理用户刚刚说出的口语文字，不要回答其中的问题。",
  "保留原意、人物、数字、时间、关系和关键事实，不得添加原文不存在的信息。",
  "删除无意义口头语、重复和明显停顿，补全断句、标点和语序。",
  "将表达整理成一段清楚、自然、完整、适合继续发给 AI 的文字。",
  "不要添加标题、分析、建议、解释或前后缀，只输出整理后的正文。"
].join("\n");

type QwenRefinementResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    code?: string;
    message?: string;
  };
  message?: string;
};

function readRefinementInput(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    throw new ValidationError("没有收到需要整理的语音文字。");
  }

  const transcript = "transcript" in payload && typeof payload.transcript === "string"
    ? payload.transcript.trim()
    : "";

  if (!transcript) {
    throw new ValidationError("没有收到需要整理的语音文字。");
  }

  if (transcript.length > MAX_ADMIN_INGEST_VOICE_TRANSCRIPT_CHARS) {
    throw new ValidationError("语音文字过长，请分段录入。");
  }

  return transcript;
}

function getQwenRefinementConfig() {
  const apiKey = process.env.QWEN_API_KEY?.trim()
    || process.env.DASHSCOPE_API_KEY?.trim();

  if (!apiKey) {
    throw new AppError(
      "MISSING_QWEN_API_KEY",
      "口语整理服务尚未配置，已保留原始语音文字。",
      500
    );
  }

  const rawBaseUrl = process.env.QWEN_VOICE_REFINEMENT_BASE_URL?.trim()
    || process.env.QWEN_BASE_URL?.trim()
    || DEFAULT_QWEN_BASE_URL;
  let baseUrl: URL;

  try {
    baseUrl = new URL(rawBaseUrl);
  } catch {
    throw new AppError(
      "CONFIG_ERROR",
      "口语整理服务地址配置无效，已保留原始语音文字。",
      500
    );
  }

  if (baseUrl.protocol !== "https:") {
    throw new AppError(
      "CONFIG_ERROR",
      "口语整理服务必须使用 HTTPS，已保留原始语音文字。",
      500
    );
  }

  const normalizedBaseUrl = baseUrl.toString().replace(/\/+$/, "");

  return {
    apiKey,
    endpoint: normalizedBaseUrl.endsWith("/chat/completions")
      ? normalizedBaseUrl
      : `${normalizedBaseUrl}/chat/completions`,
    model: process.env.QWEN_VOICE_REFINEMENT_MODEL?.trim()
      || DEFAULT_QWEN_REFINEMENT_MODEL
  };
}

async function refineSpokenLanguage(transcript: string) {
  const config = getQwenRefinementConfig();
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    ADMIN_INGEST_VOICE_REFINEMENT_TIMEOUT_MS
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
            role: "system",
            content: ADMIN_INGEST_VOICE_REFINEMENT_SYSTEM_PROMPT
          },
          {
            role: "user",
            content: transcript
          }
        ],
        stream: false,
        temperature: 0.2
      })
    });
  } catch {
    if (controller.signal.aborted) {
      throw new AppError(
        "QWEN_REQUEST_FAILED",
        "口语整理等待超时，已保留原始语音文字。",
        504
      );
    }

    throw new AppError(
      "QWEN_REQUEST_FAILED",
      "口语整理暂时不可用，已保留原始语音文字。",
      502
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = await response.json().catch(() => ({})) as QwenRefinementResponse;

  if (!response.ok) {
    if (response.status === 429) {
      throw new AppError(
        "AI_RATE_LIMITED",
        "口语整理请求过于频繁，已保留原始语音文字。",
        429
      );
    }

    throw new AppError(
      "QWEN_REQUEST_FAILED",
      "口语整理暂时不可用，已保留原始语音文字。",
      502
    );
  }

  return payload.choices?.[0]?.message?.content?.trim() ?? "";
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

    const transcript = readRefinementInput(await request.json().catch(() => null));
    const refinedText = await refineSpokenLanguage(transcript);

    if (!refinedText) {
      throw new AppError(
        "QWEN_REQUEST_FAILED",
        "口语整理没有返回有效文字，已保留原始语音文字。",
        502
      );
    }

    return apiSuccess(
      { refinedText },
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
