import "server-only";

const DEFAULT_BASE_URL = "https://api.moonshot.cn/v1";
const DEFAULT_MODEL = "moonshot-v1-128k";
const DEFAULT_MODEL_LABEL = "Kimi 128K";
const HEALTH_TIMEOUT_MS = 25_000;
const KIMI_PLACEHOLDER_API_KEY = "sk-your-kimi-api-key";

export interface KimiIngestHealthStatus {
  ok: boolean;
  configured: boolean;
  provider: "kimi";
  baseUrlConfigured: boolean;
  baseUrlSource: "configured" | "default";
  modelConfigured: boolean;
  modelSource: "configured" | "preferred" | "default";
  apiKeyConfigured: boolean;
  selectedModelLabel: string;
  model: string;
  requestedModel: string;
  actualModel?: string;
  mode: "highest" | "fixed";
  message: string;
  diagnostics: string[];
  checkedAt: string;
  requestTested: boolean;
  errorCode?: "KIMI_API_KEY_MISSING" | "KIMI_BASE_URL_INVALID" | "KIMI_REQUEST_FAILED" | "KIMI_RESPONSE_PARSE_FAILED" | "KIMI_TIMEOUT";
}

function readEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function hasUsableApiKey(value: string) {
  return Boolean(value && !value.includes(KIMI_PLACEHOLDER_API_KEY));
}

function normalizeBaseUrl(value: string) {
  return (value || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function buildChatCompletionsUrl(baseUrl: string) {
  try {
    const normalized = baseUrl.replace(/\/+$/, "");

    return normalized.endsWith("/chat/completions")
      ? new URL(normalized).toString()
      : new URL(`${normalized}/chat/completions`).toString();
  } catch {
    return "";
  }
}

function baseStatus(input: {
  preferredModel?: string | null;
  selectedModelLabel?: string | null;
}) {
  const rawBaseUrl = readEnv("KIMI_BASE_URL");
  const apiKey = readEnv("KIMI_API_KEY");
  const configuredModel = readEnv("KIMI_MODEL");
  const preferredModel = input.preferredModel || DEFAULT_MODEL;
  const model = configuredModel || preferredModel;

  return {
    apiKey,
    status: {
      ok: false,
      configured: false,
      provider: "kimi" as const,
      baseUrlConfigured: true,
      baseUrlSource: rawBaseUrl ? "configured" as const : "default" as const,
      modelConfigured: Boolean(configuredModel),
      modelSource: configuredModel ? "configured" as const : input.preferredModel ? "preferred" as const : "default" as const,
      apiKeyConfigured: hasUsableApiKey(apiKey),
      selectedModelLabel: input.selectedModelLabel || readEnv("KIMI_DISPLAY_NAME") || DEFAULT_MODEL_LABEL,
      model,
      requestedModel: model,
      mode: configuredModel ? "fixed" as const : "highest" as const,
      message: "",
      diagnostics: [] as string[],
      checkedAt: new Date().toISOString(),
      requestTested: false
    },
    baseUrl: normalizeBaseUrl(rawBaseUrl)
  };
}

export async function checkKimiIngestHealth(input: {
  preferredModel?: string | null;
  selectedModelLabel?: string | null;
  testRequest?: boolean;
} = {}): Promise<KimiIngestHealthStatus> {
  const { apiKey, baseUrl, status } = baseStatus(input);

  if (!status.apiKeyConfigured) {
    return {
      ...status,
      message: "Kimi API Key 未配置",
      errorCode: "KIMI_API_KEY_MISSING",
      diagnostics: [
        "请在本地 .env 或部署平台环境变量中配置 KIMI_API_KEY",
        "KIMI_BASE_URL 未配置时默认使用 https://api.moonshot.cn/v1",
        "KIMI_MODEL 未配置时默认使用 moonshot-v1-128k"
      ]
    };
  }

  if (input.testRequest === false) {
    return {
      ...status,
      ok: true,
      configured: true,
      message: "Kimi 接口配置已检测到",
      diagnostics: []
    };
  }

  const chatCompletionsUrl = buildChatCompletionsUrl(baseUrl);

  if (!chatCompletionsUrl) {
    return {
      ...status,
      configured: true,
      requestTested: true,
      message: "KIMI_BASE_URL 无效",
      errorCode: "KIMI_BASE_URL_INVALID",
      diagnostics: ["请确认 KIMI_BASE_URL 是合法 URL，例如 https://api.moonshot.cn/v1。"]
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(chatCompletionsUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: status.model,
        messages: [
          { role: "user", content: "只回复 OK" }
        ],
        max_tokens: 8,
        temperature: 0
      }),
      signal: controller.signal,
      cache: "no-store"
    });
    const bodyText = await response.text().catch(() => "");

    if (response.ok) {
      try {
        const payload = bodyText ? JSON.parse(bodyText) as Record<string, unknown> : {};
        const actualModel = typeof payload.model === "string" ? payload.model : status.model;
        const id = typeof payload.id === "string" ? payload.id : "";
        const choices = Array.isArray(payload.choices) ? payload.choices : [];

        if (id || choices.length > 0) {
          return {
            ...status,
            ok: true,
            configured: true,
            requestTested: true,
            actualModel,
            message: "Kimi 接口可用",
            diagnostics: []
          };
        }
      } catch {
        return {
          ...status,
          configured: true,
          requestTested: true,
          message: "Kimi 返回解析失败",
          errorCode: "KIMI_RESPONSE_PARSE_FAILED",
          diagnostics: ["Kimi 请求成功，但返回内容不是合法 JSON。"]
        };
      }
    }

    return {
      ...status,
      configured: true,
      requestTested: true,
      message: response.status === 401 || response.status === 403
        ? "KIMI_API_KEY 无效或无权访问当前模型"
        : `Kimi 请求失败（HTTP ${response.status}）`,
      errorCode: response.status === 401 || response.status === 403 ? "KIMI_API_KEY_MISSING" : "KIMI_REQUEST_FAILED",
      diagnostics: [
        "服务端已检测到 KIMI_API_KEY，但 chat/completions 真实请求未通过。",
        "请检查 KIMI_BASE_URL、KIMI_MODEL、账号额度和模型权限。"
      ]
    };
  } catch (error) {
    const isAbort = error && typeof error === "object" && (error as { name?: string }).name === "AbortError";

    return {
      ...status,
      configured: true,
      requestTested: true,
      message: isAbort ? "Kimi 健康检查请求超时，请稍后重试。" : "Kimi chat/completions 请求失败",
      errorCode: isAbort ? "KIMI_TIMEOUT" : "KIMI_REQUEST_FAILED",
      diagnostics: [
        isAbort ? "健康检查已设置超时保护，页面不会被 Kimi 请求卡住。" : "服务端无法访问 Kimi chat/completions。",
        "如果使用兼容网关，请确认 KIMI_BASE_URL 指向正确服务根地址。"
      ]
    };
  } finally {
    clearTimeout(timeout);
  }
}
