import "server-only";

import {
  DOUBAO_PRO_MODEL_ID,
  resolveIngestActualModel,
  sanitizeIngestPreferredModel
} from "@/lib/enterprise/ingest-model-options";
import {
  buildDoubaoChatCompletionsUrl,
  classifyDoubaoResponseError,
  readDoubaoRetryAfterMs,
  runWithDoubaoRequestSlot,
  type DoubaoIngestErrorCode
} from "@/lib/enterprise/doubao-ingest-client";

const DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const DEFAULT_MODEL_LABEL = "Doubao-Seed-2.1-pro";
const HEALTH_TIMEOUT_MS = 25_000;
const HEALTH_RESULT_CACHE_MS = 5 * 60_000;
const TRANSIENT_HEALTH_CACHE_MS = 5_000;
const MAX_RATE_LIMIT_HEALTH_CACHE_MS = 30_000;

type CachedDoubaoHealthStatus = {
  expiresAt: number;
  status: DoubaoIngestHealthStatus;
};

const testedHealthCache = new Map<string, CachedDoubaoHealthStatus>();
const testedHealthRequests = new Map<string, Promise<DoubaoIngestHealthStatus>>();

export interface DoubaoIngestHealthStatus {
  ok: boolean;
  configured: boolean;
  provider: "doubao";
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
  errorCode?: DoubaoIngestErrorCode;
  retryAfterMs?: number;
}

function readEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function hasUsableApiKey(value: string) {
  return Boolean(value && !/^(your|replace|changeme)/i.test(value) && !value.includes("ARK_API_KEY"));
}

function baseStatus(input: {
  preferredModel?: string | null;
  selectedModelLabel?: string | null;
}) {
  const rawBaseUrl = readEnv("DOUBAO_BASE_URL");
  const apiKey = readEnv("ARK_API_KEY") || readEnv("DOUBAO_API_KEY");
  const configuredModel = readEnv("DOUBAO_PRO_MODEL") || readEnv("DOUBAO_MODEL");
  const preferredModel = sanitizeIngestPreferredModel(input.preferredModel);
  const model = preferredModel || resolveIngestActualModel("doubao-pro") || DOUBAO_PRO_MODEL_ID;

  return {
    apiKey,
    baseUrl: rawBaseUrl || DEFAULT_BASE_URL,
    status: {
      ok: false,
      configured: false,
      provider: "doubao" as const,
      baseUrlConfigured: true,
      baseUrlSource: rawBaseUrl ? "configured" as const : "default" as const,
      modelConfigured: Boolean(configuredModel),
      modelSource: configuredModel ? "configured" as const : preferredModel ? "preferred" as const : "default" as const,
      apiKeyConfigured: hasUsableApiKey(apiKey),
      selectedModelLabel: input.selectedModelLabel || readEnv("DOUBAO_DISPLAY_NAME") || DEFAULT_MODEL_LABEL,
      model,
      requestedModel: model,
      mode: configuredModel || preferredModel ? "fixed" as const : "highest" as const,
      message: "",
      diagnostics: [] as string[],
      checkedAt: new Date().toISOString(),
      requestTested: false
    }
  };
}

async function runDoubaoIngestHealthCheck(input: {
  preferredModel?: string | null;
  selectedModelLabel?: string | null;
  testRequest?: boolean;
} = {}): Promise<DoubaoIngestHealthStatus> {
  const { apiKey, baseUrl, status } = baseStatus(input);

  if (!status.apiKeyConfigured) {
    return {
      ...status,
      message: "豆包 Ark API Key 未配置",
      errorCode: "DOUBAO_API_KEY_MISSING",
      diagnostics: [
        "请在服务端环境变量中配置 ARK_API_KEY。",
        `DOUBAO_BASE_URL 未配置时默认使用 ${DEFAULT_BASE_URL}。`,
        "如 Ark 控制台要求接入点 ID，请将其配置到 DOUBAO_PRO_MODEL。"
      ]
    };
  }

  if (input.testRequest === false) {
    return {
      ...status,
      ok: true,
      configured: true,
      message: "豆包 Ark 接口配置已检测到"
    };
  }

  let chatCompletionsUrl = "";

  try {
    chatCompletionsUrl = buildDoubaoChatCompletionsUrl(baseUrl);
  } catch {
    return {
      ...status,
      configured: true,
      requestTested: true,
      message: "DOUBAO_BASE_URL 无效",
      errorCode: "DOUBAO_BASE_URL_INVALID",
      diagnostics: [`请确认 DOUBAO_BASE_URL 是合法 URL，例如 ${DEFAULT_BASE_URL}。`]
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const response = await runWithDoubaoRequestSlot({
      phase: "health",
      signal: controller.signal,
      task: () => fetch(chatCompletionsUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: status.model,
          messages: [{ role: "user", content: "只回复 OK" }],
          max_tokens: 8,
          temperature: 0,
          stream: false
        }),
        signal: controller.signal,
        cache: "no-store"
      })
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
            message: "豆包 Ark 接口可用",
            diagnostics: []
          };
        }
      } catch {
        return {
          ...status,
          configured: true,
          requestTested: true,
          message: "豆包返回解析失败",
          errorCode: "DOUBAO_RESPONSE_PARSE_FAILED",
          diagnostics: ["豆包请求成功，但返回内容不是合法 JSON。"]
        };
      }

      return {
        ...status,
        configured: true,
        requestTested: true,
        message: "豆包返回缺少响应 ID 和 choices",
        errorCode: "DOUBAO_RESPONSE_PARSE_FAILED",
        diagnostics: ["Ark Chat API 返回 JSON，但缺少可验证的响应字段。"]
      };
    }

    const retryAfterMs = readDoubaoRetryAfterMs(response.headers);
    const classified = classifyDoubaoResponseError(response.status, bodyText, {
      retryAfterMs
    });

    return {
      ...status,
      configured: true,
      requestTested: true,
      message: classified.message,
      errorCode: classified.code,
      retryAfterMs: classified.details.retryAfterMs,
      diagnostics: [
        "服务端已检测到 ARK_API_KEY，但 Ark chat/completions 真实请求未通过。",
        "请检查 DOUBAO_BASE_URL、DOUBAO_PRO_MODEL、账号额度和模型权限。"
      ]
    };
  } catch (error) {
    const isAbort = error && typeof error === "object" && (error as { name?: string }).name === "AbortError";

    return {
      ...status,
      configured: true,
      requestTested: true,
      message: isAbort ? "豆包健康检查请求超时，请稍后重试。" : "豆包 Ark chat/completions 请求失败",
      errorCode: isAbort ? "DOUBAO_TIMEOUT" : "DOUBAO_REQUEST_FAILED",
      diagnostics: [
        isAbort ? "健康检查已设置超时保护，页面不会被豆包请求卡住。" : "服务端无法访问豆包 Ark chat/completions。",
        "如果使用兼容网关，请确认 DOUBAO_BASE_URL 指向正确服务根地址。"
      ]
    };
  } finally {
    clearTimeout(timeout);
  }
}

function resolveTestedHealthCacheMs(status: DoubaoIngestHealthStatus) {
  if (
    status.errorCode === "DOUBAO_TIMEOUT"
    || status.errorCode === "DOUBAO_REQUEST_FAILED"
  ) {
    return TRANSIENT_HEALTH_CACHE_MS;
  }

  if (status.errorCode === "DOUBAO_RATE_LIMITED") {
    return Math.min(
      MAX_RATE_LIMIT_HEALTH_CACHE_MS,
      Math.max(TRANSIENT_HEALTH_CACHE_MS, status.retryAfterMs ?? TRANSIENT_HEALTH_CACHE_MS)
    );
  }

  return HEALTH_RESULT_CACHE_MS;
}

export async function checkDoubaoIngestHealth(input: {
  preferredModel?: string | null;
  selectedModelLabel?: string | null;
  testRequest?: boolean;
} = {}): Promise<DoubaoIngestHealthStatus> {
  if (input.testRequest !== true) {
    return runDoubaoIngestHealthCheck({
      ...input,
      testRequest: false
    });
  }

  const { baseUrl, status } = baseStatus(input);
  const cacheKey = `${baseUrl}|${status.model}`;
  const cached = testedHealthCache.get(cacheKey);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.status;
  }

  const existingRequest = testedHealthRequests.get(cacheKey);

  if (existingRequest) {
    return existingRequest;
  }

  const request = runDoubaoIngestHealthCheck({
    ...input,
    testRequest: true
  }).then((nextStatus) => {
    testedHealthCache.set(cacheKey, {
      expiresAt: Date.now() + resolveTestedHealthCacheMs(nextStatus),
      status: nextStatus
    });

    return nextStatus;
  }).finally(() => {
    testedHealthRequests.delete(cacheKey);
  });

  testedHealthRequests.set(cacheKey, request);

  return request;
}
