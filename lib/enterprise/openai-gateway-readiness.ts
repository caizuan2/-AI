export const OPENAI_REGION_UNSUPPORTED_ERROR_CODE = "OPENAI_REGION_UNSUPPORTED" as const;

export interface OpenAIProviderErrorDetails {
  type: string | null;
  code: string | null;
  message: string | null;
}

export interface OpenAIGatewayBaseUrlValidation {
  ok: boolean;
  normalizedBaseUrl: string;
  message: string;
}

const OPENAI_REGION_ERROR_IDENTIFIERS = [
  "unsupported_country_region_territory",
  "unsupported_country_region",
  "country, region, or territory not supported",
  "country or region not supported"
];

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readProviderErrorRecord(bodyText: string) {
  try {
    const parsed = JSON.parse(bodyText) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const root = parsed as Record<string, unknown>;
    const error = root.error && typeof root.error === "object" && !Array.isArray(root.error)
      ? root.error as Record<string, unknown>
      : root;

    return error;
  } catch {
    return null;
  }
}

export function readOpenAIProviderError(bodyText: string): OpenAIProviderErrorDetails {
  const error = readProviderErrorRecord(bodyText);

  return {
    type: readString(error?.type),
    code: readString(error?.code),
    message: readString(error?.message)
  };
}

export function isOpenAIRegionUnsupportedResponse(status: number, bodyText: string) {
  if (status !== 403) {
    return false;
  }

  const error = readOpenAIProviderError(bodyText);
  const searchable = [
    error.type,
    error.code,
    error.message,
    bodyText
  ].filter(Boolean).join(" ").toLowerCase();

  return OPENAI_REGION_ERROR_IDENTIFIERS.some((identifier) => searchable.includes(identifier));
}

export function matchesOpenAIRequestedModel(requestedModel: string, actualModel: string) {
  const requested = requestedModel.trim().toLowerCase();
  const actual = actualModel.trim().toLowerCase();

  if (!requested || !actual) {
    return false;
  }

  if (requested === actual) {
    return true;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(requested.slice(-10))) {
    return false;
  }

  return new RegExp(`^${requested.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-\\d{4}-\\d{2}-\\d{2}$`).test(actual);
}

function isLoopbackHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase();

  return normalized === "localhost"
    || normalized === "127.0.0.1"
    || normalized === "::1"
    || normalized === "[::1]";
}

export function validateOpenAIGatewayBaseUrl(
  value: string,
  options: {
    allowLocalHttp?: boolean;
  } = {}
): OpenAIGatewayBaseUrlValidation {
  const normalizedValue = value.trim().replace(/\/+$/, "");

  if (!normalizedValue) {
    return {
      ok: false,
      normalizedBaseUrl: "",
      message: "缺少 OPENAI_BASE_URL，GPT 网关预检已停止。"
    };
  }

  let url: URL;

  try {
    url = new URL(normalizedValue);
  } catch {
    return {
      ok: false,
      normalizedBaseUrl: normalizedValue,
      message: "OPENAI_BASE_URL 不是合法 URL。"
    };
  }

  if (url.username || url.password) {
    return {
      ok: false,
      normalizedBaseUrl: normalizedValue,
      message: "OPENAI_BASE_URL 不允许包含用户名或密码。"
    };
  }

  if (url.search || url.hash) {
    return {
      ok: false,
      normalizedBaseUrl: normalizedValue,
      message: "OPENAI_BASE_URL 不允许包含查询参数或锚点。"
    };
  }

  const localHttpAllowed = options.allowLocalHttp === true && isLoopbackHostname(url.hostname);

  if (url.protocol !== "https:" && !localHttpAllowed) {
    return {
      ok: false,
      normalizedBaseUrl: normalizedValue,
      message: "GPT 网关必须使用 HTTPS；只有本机预览允许 HTTP。"
    };
  }

  if (!url.pathname.toLowerCase().endsWith("/v1")) {
    return {
      ok: false,
      normalizedBaseUrl: normalizedValue,
      message: "OPENAI_BASE_URL 必须指向以 /v1 结尾的 API 根路径。"
    };
  }

  return {
    ok: true,
    normalizedBaseUrl: normalizedValue,
    message: "GPT 网关地址格式有效。"
  };
}
