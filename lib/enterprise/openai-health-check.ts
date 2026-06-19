import "server-only";

import { ProxyAgent } from "undici";
import { getGptModelSelectionByDisplayName } from "@/lib/enterprise/gpt-model-options";
import { extractResponsesText } from "@/lib/enterprise/gpt-output-normalizer";
import { OPENAI_PLACEHOLDER_API_KEY } from "@/lib/server-config-core";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-5.5";
const DEFAULT_MODEL_LABEL = "GPT-5.5 超高";
const HEALTH_TIMEOUT_MS = 25_000;
const WINDOWS_LOCAL_PROXY_URL = "http://127.0.0.1:7897";

type OpenAIHealthErrorCode =
  | "OPENAI_API_KEY_MISSING"
  | "OPENAI_BASE_URL_INVALID"
  | "OPENAI_RESPONSES_REQUEST_FAILED"
  | "OPENAI_RESPONSES_PARSE_FAILED"
  | "OPENAI_TIMEOUT";

export interface OpenAIIngestHealthStatus {
  ok: boolean;
  configured: boolean;
  provider: "openai";
  baseUrlConfigured: boolean;
  baseUrlSource: "configured" | "default";
  modelConfigured: boolean;
  modelSource: "configured" | "preferred" | "default";
  apiKeyConfigured: boolean;
  selectedModelLabel: string;
  model: string;
  mode: "highest" | "fixed";
  message: string;
  diagnostics: string[];
  checkedAt: string;
  requestTested: boolean;
  errorCode?: OpenAIHealthErrorCode;
}

function readEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function normalizeBaseUrl(value: string) {
  return (value || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function buildResponsesUrl(baseUrl: string) {
  try {
    return new URL(`${baseUrl.replace(/\/+$/, "")}/responses`).toString();
  } catch {
    return "";
  }
}

function unique(values: string[]) {
  const seen = new Set<string>();

  return values.filter((value) => {
    const normalized = value.trim();

    if (!normalized || seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}

function readProxyUrls() {
  return unique([
    readEnv("OPENAI_PROXY_URL"),
    readEnv("HTTPS_PROXY"),
    readEnv("HTTP_PROXY"),
    process.platform === "win32" ? WINDOWS_LOCAL_PROXY_URL : ""
  ]);
}

function isNetworkFetchError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as { name?: unknown; message?: unknown; cause?: { code?: unknown; message?: unknown } };
  const message = `${typeof record.message === "string" ? record.message : ""} ${typeof record.cause?.message === "string" ? record.cause.message : ""}`.toLowerCase();
  const code = typeof record.cause?.code === "string" ? record.cause.code : "";

  return record.name === "TypeError" || code.startsWith("UND_ERR_") || message.includes("fetch failed") || message.includes("connect timeout");
}

async function fetchOpenAIResponses(url: string, init: RequestInit) {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (!isNetworkFetchError(error)) {
      throw error;
    }

    let lastError = error;

    for (const proxyUrl of readProxyUrls()) {
      try {
        return await fetch(url, {
          ...init,
          dispatcher: new ProxyAgent(proxyUrl)
        } as RequestInit & { dispatcher: ProxyAgent });
      } catch (proxyError) {
        lastError = proxyError;
      }
    }

    throw lastError;
  }
}

function hasUsableApiKey(value: string) {
  return Boolean(value && !value.includes(OPENAI_PLACEHOLDER_API_KEY));
}

function readModelConfig(input: {
  preferredModel?: string | null;
  selectedModelLabel?: string | null;
}) {
  const selection = getGptModelSelectionByDisplayName(input.selectedModelLabel ?? DEFAULT_MODEL_LABEL);
  const configuredModel = readEnv("OPENAI_MODEL");
  const preferredModel = input.preferredModel || readEnv("OPENAI_PREFERRED_MODEL") || selection.apiModel || DEFAULT_MODEL;

  if (configuredModel && configuredModel.toLowerCase() !== "auto") {
    return {
      model: configuredModel,
      mode: "fixed" as const,
      modelSource: "configured" as const,
      selectedModelLabel: input.selectedModelLabel || selection.displayName || DEFAULT_MODEL_LABEL
    };
  }

  return {
    model: preferredModel || DEFAULT_MODEL,
    mode: "highest" as const,
    modelSource: preferredModel ? "preferred" as const : "default" as const,
    selectedModelLabel: input.selectedModelLabel || selection.displayName || DEFAULT_MODEL_LABEL
  };
}

function baseStatus(input: {
  preferredModel?: string | null;
  selectedModelLabel?: string | null;
}) {
  const rawBaseUrl = readEnv("OPENAI_BASE_URL");
  const apiKey = readEnv("OPENAI_API_KEY");
  const modelConfig = readModelConfig(input);

  return {
    apiKey,
    status: {
      ok: false,
      configured: false,
      provider: "openai" as const,
      baseUrlConfigured: true,
      baseUrlSource: rawBaseUrl ? "configured" as const : "default" as const,
      modelConfigured: true,
      modelSource: modelConfig.modelSource,
      apiKeyConfigured: hasUsableApiKey(apiKey),
      selectedModelLabel: modelConfig.selectedModelLabel,
      model: modelConfig.model,
      mode: modelConfig.mode,
      message: "",
      diagnostics: [] as string[],
      checkedAt: new Date().toISOString(),
      requestTested: false
    },
    baseUrl: normalizeBaseUrl(rawBaseUrl)
  };
}

function timeoutMessage() {
  return "GPT 健康检查请求超时，请稍后重试或检查 OPENAI_BASE_URL。";
}

export async function checkOpenAIIngestHealth(input: {
  preferredModel?: string | null;
  selectedModelLabel?: string | null;
  testRequest?: boolean;
} = {}): Promise<OpenAIIngestHealthStatus> {
  const { apiKey, baseUrl, status } = baseStatus(input);

  if (!status.apiKeyConfigured) {
    return {
      ...status,
      message: "缺少 OPENAI_API_KEY",
      errorCode: "OPENAI_API_KEY_MISSING",
      diagnostics: [
        "请在本地 .env 或部署平台环境变量中配置 OPENAI_API_KEY",
        "OPENAI_BASE_URL 未配置时默认使用 https://api.openai.com/v1",
        "OPENAI_MODEL 未配置时默认使用 OPENAI_PREFERRED_MODEL 或 gpt-5.5"
      ]
    };
  }

  if (input.testRequest === false) {
    return {
      ...status,
      ok: true,
      configured: true,
      message: "GPT 接口配置已检测到",
      diagnostics: []
    };
  }

  const responsesUrl = buildResponsesUrl(baseUrl);

  if (!responsesUrl) {
    return {
      ...status,
      configured: true,
      requestTested: true,
      message: "OPENAI_BASE_URL 无效",
      errorCode: "OPENAI_BASE_URL_INVALID",
      diagnostics: ["请确认 OPENAI_BASE_URL 是合法 URL，例如 https://api.openai.com/v1。"]
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const response = await fetchOpenAIResponses(responsesUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: status.model,
        input: "只回复 OK"
      }),
      signal: controller.signal,
      cache: "no-store"
    });
    const bodyText = await response.text().catch(() => "");

    if (response.ok) {
      let payload: unknown = null;

      try {
        payload = bodyText ? JSON.parse(bodyText) as unknown : null;
      } catch {
        return {
          ...status,
          configured: true,
          requestTested: true,
          message: "OpenAI Responses API 返回解析失败",
          errorCode: "OPENAI_RESPONSES_PARSE_FAILED",
          diagnostics: ["OpenAI Responses API 请求成功，但返回内容不是合法 JSON。"]
        };
      }

      const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
      const responseStatus = typeof record.status === "string" ? record.status : "";
      const responseText = extractResponsesText(payload);

      if (payload && (responseStatus === "completed" || responseText || record.id)) {
        return {
          ...status,
          ok: true,
          configured: true,
          requestTested: true,
          message: "GPT 接口可用",
          diagnostics: []
        };
      }

      return {
        ...status,
        configured: true,
        requestTested: true,
        message: "OpenAI Responses API 返回解析失败",
        errorCode: "OPENAI_RESPONSES_PARSE_FAILED",
        diagnostics: ["OpenAI Responses API 已返回，但未找到 output_text 或 message.content.text。"]
      };
    }

    const lower = bodyText.toLowerCase();
    const message = response.status === 401 || response.status === 403
      ? "OPENAI_API_KEY 无效或无权访问当前模型"
      : response.status === 404 || lower.includes("model")
        ? "当前 GPT 模型不可用，请检查 OPENAI_MODEL 或模型权限"
        : `OpenAI Responses API 请求失败（HTTP ${response.status}）`;

    return {
      ...status,
      configured: true,
      requestTested: true,
      message,
      errorCode: "OPENAI_RESPONSES_REQUEST_FAILED",
      diagnostics: [
        "服务端已检测到 OPENAI_API_KEY，但 Responses API 真实请求未通过。",
        "请检查 OPENAI_BASE_URL、OPENAI_MODEL、账号额度和模型权限。"
      ]
    };
  } catch (error) {
    const isAbort = error && typeof error === "object" && (error as { name?: string }).name === "AbortError";

    return {
      ...status,
      configured: true,
      requestTested: true,
      message: isAbort ? timeoutMessage() : "OpenAI Responses API 请求失败",
      errorCode: isAbort ? "OPENAI_TIMEOUT" : "OPENAI_RESPONSES_REQUEST_FAILED",
      diagnostics: [
        isAbort ? "健康检查已设置超时保护，页面不会被 GPT 请求卡住。" : "服务端无法访问 OpenAI Responses API。",
        "如果使用代理或兼容网关，请确认 OPENAI_BASE_URL 指向 /v1。"
      ]
    };
  } finally {
    clearTimeout(timeout);
  }
}
