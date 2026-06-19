import "server-only";

import { getGptModelSelectionByDisplayName } from "@/lib/enterprise/gpt-model-options";
import { OPENAI_PLACEHOLDER_API_KEY } from "@/lib/server-config-core";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-5.5";
const DEFAULT_MODEL_LABEL = "GPT-5.5 超高";
const HEALTH_TIMEOUT_MS = 7_000;

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
}

function readEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function normalizeBaseUrl(value: string) {
  return (value || DEFAULT_BASE_URL).replace(/\/+$/, "");
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
      selectedModelLabel: input.selectedModelLabel || selection.displayName || configuredModel
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      signal: controller.signal,
      cache: "no-store"
    });

    if (response.ok) {
      return {
        ...status,
        ok: true,
        configured: true,
        requestTested: true,
        message: "GPT 接口检测通过",
        diagnostics: []
      };
    }

    const bodyText = await response.text().catch(() => "");
    const lower = bodyText.toLowerCase();
    const message = response.status === 401 || response.status === 403
      ? "OPENAI_API_KEY 无效或无权访问当前模型"
      : response.status === 404 || lower.includes("model")
        ? "当前 GPT 模型不可用，请检查 OPENAI_MODEL 或模型权限"
        : `GPT 健康检查请求失败（HTTP ${response.status}）`;

    return {
      ...status,
      configured: true,
      requestTested: true,
      message,
      diagnostics: [
        "服务端已检测到 OPENAI_API_KEY，但真实请求未通过。",
        "请检查 OPENAI_BASE_URL、OPENAI_MODEL、账号额度和模型权限。"
      ]
    };
  } catch (error) {
    const isAbort = error && typeof error === "object" && (error as { name?: string }).name === "AbortError";

    return {
      ...status,
      configured: true,
      requestTested: true,
      message: isAbort ? timeoutMessage() : "GPT 健康检查请求失败，请检查网络或 OPENAI_BASE_URL。",
      diagnostics: [
        isAbort ? "健康检查已设置超时保护，页面不会被 GPT 请求卡住。" : "服务端无法访问 OpenAI 模型接口。",
        "如果使用代理或兼容网关，请确认 OPENAI_BASE_URL 指向 /v1。"
      ]
    };
  } finally {
    clearTimeout(timeout);
  }
}
