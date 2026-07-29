import { timingSafeEqual } from "node:crypto";

const DEFAULT_UPSTREAM_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MAX_BODY_BYTES = 1_048_576;
const DEFAULT_UPSTREAM_TIMEOUT_MS = 240_000;
const ALLOWED_REQUEST_FIELDS = new Set([
  "model",
  "instructions",
  "input",
  "reasoning",
  "text",
  "max_output_tokens",
  "stream"
]);

export type GatewayContext = {
  ip?: string;
  params?: Record<string, string>;
};

export function readEnv(name: string) {
  return (process.env[name] ?? "").trim();
}

export function jsonError(status: number, code: string, message: string) {
  return Response.json({
    error: {
      type: "gateway_error",
      code,
      message
    }
  }, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function parsePositiveInteger(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function secureEqual(actual: string, expected: string) {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);

  return actualBytes.length === expectedBytes.length
    && timingSafeEqual(actualBytes, expectedBytes);
}

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer[ \t]+(.+)$/i);

  return match?.[1]?.trim() ?? "";
}

export function resolveUpstreamBaseUrl() {
  const rawBaseUrl = readEnv("OPENAI_UPSTREAM_BASE_URL") || DEFAULT_UPSTREAM_BASE_URL;
  let parsed: URL;

  try {
    parsed = new URL(rawBaseUrl);
  } catch {
    return null;
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/, "");
  const valid = parsed.protocol === "https:"
    && parsed.hostname === "api.openai.com"
    && normalizedPath === "/v1"
    && !parsed.username
    && !parsed.password
    && !parsed.search
    && !parsed.hash;

  return valid ? "https://api.openai.com/v1" : null;
}

function resolveUpstreamResponsesUrl() {
  const baseUrl = resolveUpstreamBaseUrl();

  return baseUrl ? `${baseUrl}/responses` : null;
}

function isAllowedSourceIp(context: GatewayContext) {
  const configured = readEnv("OPENAI_GATEWAY_ALLOWED_IPS")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return configured.length > 0
    && typeof context.ip === "string"
    && configured.includes(context.ip.trim());
}

export function authorizeGatewayRequest(request: Request, context: GatewayContext) {
  const gatewayToken = readEnv("OPENAI_GATEWAY_TOKEN");
  const upstreamApiKey = readEnv("OPENAI_UPSTREAM_API_KEY");
  const allowedModel = readEnv("OPENAI_GATEWAY_MODEL");
  const upstreamBaseUrl = resolveUpstreamBaseUrl();

  if (!gatewayToken || !upstreamApiKey || !allowedModel || !upstreamBaseUrl) {
    return {
      ok: false as const,
      response: jsonError(503, "OPENAI_GATEWAY_NOT_CONFIGURED", "Gateway configuration is incomplete.")
    };
  }

  if (!isAllowedSourceIp(context)) {
    return {
      ok: false as const,
      response: jsonError(403, "OPENAI_GATEWAY_SOURCE_FORBIDDEN", "Source IP is not allowed.")
    };
  }

  const bearerToken = readBearerToken(request);

  if (!bearerToken || !secureEqual(bearerToken, gatewayToken)) {
    return {
      ok: false as const,
      response: jsonError(401, "OPENAI_GATEWAY_UNAUTHORIZED", "Gateway token is invalid.")
    };
  }

  return {
    ok: true as const,
    upstreamApiKey,
    allowedModel,
    upstreamBaseUrl
  };
}

function validateRequestBody(value: unknown, allowedModel: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false as const, code: "OPENAI_GATEWAY_BODY_INVALID", message: "Request body must be a JSON object." };
  }

  const record = value as Record<string, unknown>;
  const unknownField = Object.keys(record).find((key) => !ALLOWED_REQUEST_FIELDS.has(key));

  if (unknownField) {
    return {
      ok: false as const,
      code: "OPENAI_GATEWAY_FIELD_UNSUPPORTED",
      message: `Unsupported request field: ${unknownField}`
    };
  }

  if (record.model !== allowedModel) {
    return {
      ok: false as const,
      code: "OPENAI_GATEWAY_MODEL_MISMATCH",
      message: "Requested model is not enabled on this gateway."
    };
  }

  if (typeof record.input !== "string" && !Array.isArray(record.input)) {
    return {
      ok: false as const,
      code: "OPENAI_GATEWAY_INPUT_INVALID",
      message: "Request input must be a string or array."
    };
  }

  if (record.stream !== undefined && typeof record.stream !== "boolean") {
    return {
      ok: false as const,
      code: "OPENAI_GATEWAY_STREAM_INVALID",
      message: "Request stream must be a boolean."
    };
  }

  if (record.max_output_tokens !== undefined) {
    const tokens = record.max_output_tokens;

    if (!Number.isSafeInteger(tokens) || (tokens as number) <= 0 || (tokens as number) > 12_000) {
      return {
        ok: false as const,
        code: "OPENAI_GATEWAY_OUTPUT_LIMIT_INVALID",
        message: "max_output_tokens must be between 1 and 12000."
      };
    }
  }

  return { ok: true as const, body: record };
}

export default async function handler(request: Request, context: GatewayContext = {}) {
  if (request.method !== "POST") {
    return jsonError(405, "OPENAI_GATEWAY_METHOD_NOT_ALLOWED", "Only POST is allowed.");
  }

  const authorization = authorizeGatewayRequest(request, context);

  if (!authorization.ok) {
    return authorization.response;
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (!contentType.startsWith("application/json")) {
    return jsonError(415, "OPENAI_GATEWAY_CONTENT_TYPE_INVALID", "Content-Type must be application/json.");
  }

  const maxBodyBytes = parsePositiveInteger(readEnv("OPENAI_GATEWAY_MAX_BODY_BYTES"), DEFAULT_MAX_BODY_BYTES);
  const declaredLength = Number.parseInt(request.headers.get("content-length") ?? "0", 10);

  if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
    return jsonError(413, "OPENAI_GATEWAY_BODY_TOO_LARGE", "Request body is too large.");
  }

  const bodyText = await request.text();

  if (Buffer.byteLength(bodyText, "utf8") > maxBodyBytes) {
    return jsonError(413, "OPENAI_GATEWAY_BODY_TOO_LARGE", "Request body is too large.");
  }

  let body: unknown;

  try {
    body = JSON.parse(bodyText);
  } catch {
    return jsonError(400, "OPENAI_GATEWAY_JSON_INVALID", "Request body is not valid JSON.");
  }

  const validated = validateRequestBody(body, authorization.allowedModel);

  if (!validated.ok) {
    return jsonError(400, validated.code, validated.message);
  }

  const controller = new AbortController();
  const timeoutMs = parsePositiveInteger(readEnv("OPENAI_GATEWAY_UPSTREAM_TIMEOUT_MS"), DEFAULT_UPSTREAM_TIMEOUT_MS);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const maxOutputTokens = validated.body.max_output_tokens;
  const useBackgroundMode = validated.body.reasoning !== undefined
    || (typeof maxOutputTokens === "number" && maxOutputTokens > 64);
  const upstreamBody = useBackgroundMode
    ? {
      ...validated.body,
      stream: false,
      background: true,
      store: true
    }
    : validated.body;

  try {
    const upstreamResponse = await fetch(`${authorization.upstreamBaseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authorization.upstreamApiKey}`,
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify(upstreamBody),
      signal: controller.signal
    });
    const responseHeaders = new Headers({
      "Cache-Control": "no-store",
      "Content-Type": upstreamResponse.headers.get("content-type") || "application/json",
      "X-Content-Type-Options": "nosniff"
    });
    const upstreamRequestId = upstreamResponse.headers.get("x-request-id");

    if (upstreamRequestId) {
      responseHeaders.set("X-OpenAI-Request-Id", upstreamRequestId);
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders
    });
  } catch (error) {
    const aborted = error && typeof error === "object" && (error as { name?: unknown }).name === "AbortError";

    return jsonError(
      aborted ? 504 : 502,
      aborted ? "OPENAI_GATEWAY_UPSTREAM_TIMEOUT" : "OPENAI_GATEWAY_UPSTREAM_FAILED",
      aborted ? "OpenAI upstream request timed out." : "OpenAI upstream request failed."
    );
  } finally {
    clearTimeout(timeout);
  }
}

export const config = {
  path: "/v1/responses"
};

export const __openAIGatewayTestHooks = {
  authorizeGatewayRequest,
  resolveUpstreamBaseUrl,
  resolveUpstreamResponsesUrl,
  validateRequestBody
};
