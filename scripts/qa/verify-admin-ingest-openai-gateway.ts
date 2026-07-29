import "dotenv/config";

import {
  isOpenAIRegionUnsupportedResponse,
  matchesOpenAIRequestedModel,
  OPENAI_REGION_UNSUPPORTED_ERROR_CODE,
  readOpenAIProviderError,
  validateOpenAIGatewayBaseUrl
} from "../../lib/enterprise/openai-gateway-readiness";

const REQUEST_TIMEOUT_MS = 30_000;
const allowLocalHttp = process.argv.includes("--allow-local-http");
const allowEnabledFlags = process.argv.includes("--allow-enabled");

function readEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function readOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "";
  }

  const record = payload as Record<string, unknown>;

  if (typeof record.output_text === "string" && record.output_text.trim()) {
    return record.output_text.trim();
  }

  if (!Array.isArray(record.output)) {
    return "";
  }

  return record.output
    .flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return [];
      }

      const content = (item as Record<string, unknown>).content;

      return Array.isArray(content) ? content : [];
    })
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return "";
      }

      const text = (item as Record<string, unknown>).text;

      return typeof text === "string" ? text.trim() : "";
    })
    .filter(Boolean)
    .join("\n");
}

function fail(message: string, details: Record<string, unknown>, exitCode: number): never {
  console.error("OPENAI_GATEWAY_PREFLIGHT_FAILED");
  console.error(JSON.stringify({
    message,
    ...details
  }, null, 2));
  process.exit(exitCode);
}

async function main() {
  const apiKey = readEnv("OPENAI_API_KEY");
  const baseUrl = readEnv("OPENAI_BASE_URL");
  const requestedModel = readEnv("OPENAI_MODEL");
  const serverFlagEnabled = readEnv("AI_ENABLE_GPT_55").toLowerCase() === "true"
    || readEnv("AI_ENABLE_OPENAI_INGEST").toLowerCase() === "true";
  const publicFlagEnabled = readEnv("NEXT_PUBLIC_AI_ENABLE_GPT_55").toLowerCase() === "true"
    || readEnv("NEXT_PUBLIC_AI_ENABLE_OPENAI_INGEST").toLowerCase() === "true";
  const gatewayValidation = validateOpenAIGatewayBaseUrl(baseUrl, {
    allowLocalHttp
  });

  if (!apiKey || apiKey.includes("sk-your-openai-api-key")) {
    fail("OPENAI_API_KEY 缺失或仍是占位值。", {
      errorCode: "OPENAI_API_KEY_MISSING"
    }, 2);
  }

  if (!requestedModel || requestedModel.toLowerCase() === "auto") {
    fail("OPENAI_MODEL 必须配置为网关真实授权的固定模型。", {
      errorCode: "OPENAI_MODEL_MISSING"
    }, 2);
  }

  if (!gatewayValidation.ok) {
    fail(gatewayValidation.message, {
      errorCode: "OPENAI_BASE_URL_INVALID",
      baseUrlConfigured: Boolean(baseUrl)
    }, 2);
  }

  if ((serverFlagEnabled || publicFlagEnabled) && !allowEnabledFlags) {
    fail("GPT 开关已提前启用。请先关闭开关完成网关预检；真实预检通过后再启用，并使用 --allow-enabled 复验。", {
      errorCode: "OPENAI_GATEWAY_UNSAFE_ENABLEMENT",
      serverFlagEnabled,
      publicFlagEnabled
    }, 2);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetch(`${gatewayValidation.normalizedBaseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify({
        model: requestedModel,
        input: "生产启用前验收：只回复 OK。",
        max_output_tokens: 64,
        stream: false
      }),
      signal: controller.signal
    });
    const bodyText = await response.text();
    const durationMs = Date.now() - startedAt;

    if (!response.ok) {
      const providerError = readOpenAIProviderError(bodyText);
      const regionUnsupported = isOpenAIRegionUnsupportedResponse(response.status, bodyText);

      fail(
        regionUnsupported
          ? "当前出口地区不受 OpenAI 支持，禁止开启 GPT 投喂入口。"
          : `GPT 网关真实请求失败（HTTP ${response.status}）。`,
        {
          errorCode: regionUnsupported ? OPENAI_REGION_UNSUPPORTED_ERROR_CODE : "OPENAI_GATEWAY_REQUEST_FAILED",
          status: response.status,
          providerErrorType: providerError.type,
          providerErrorCode: providerError.code,
          durationMs
        },
        regionUnsupported ? 3 : 4
      );
    }

    let payload: unknown;

    try {
      payload = JSON.parse(bodyText) as unknown;
    } catch {
      fail("GPT 网关返回了非 JSON 内容。", {
        errorCode: "OPENAI_GATEWAY_RESPONSE_PARSE_FAILED",
        status: response.status,
        responseBytes: bodyText.length,
        durationMs
      }, 5);
    }

    const record = payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {};
    const actualModel = typeof record.model === "string" ? record.model.trim() : "";
    const responseId = typeof record.id === "string" ? record.id.trim() : "";
    const outputText = readOutputText(payload);
    const modelIdentityMatched = matchesOpenAIRequestedModel(requestedModel, actualModel);

    if (!responseId || !actualModel || !modelIdentityMatched || !outputText) {
      fail("GPT 网关返回身份或正文不完整，禁止开启 GPT 投喂入口。", {
        errorCode: "OPENAI_GATEWAY_IDENTITY_MISMATCH",
        requestedModel,
        actualModel: actualModel || null,
        responseIdPresent: Boolean(responseId),
        contentLength: outputText.length,
        durationMs
      }, 6);
    }

    console.log("OPENAI_GATEWAY_PREFLIGHT_OK");
    console.log(JSON.stringify({
      provider: "openai",
      requestedProvider: "openai",
      actualProvider: "openai",
      requestedModel,
      actualModel,
      modelIdentityMatched,
      fallbackUsed: false,
      responseIdPresent: true,
      contentLength: outputText.length,
      durationMs,
      serverFlagEnabled,
      publicFlagEnabled,
      verificationPhase: serverFlagEnabled || publicFlagEnabled ? "post_enable" : "pre_enable"
    }, null, 2));
  } catch (error) {
    if (error && typeof error === "object" && (error as { name?: unknown }).name === "AbortError") {
      fail("GPT 网关预检30秒超时，禁止开启 GPT 投喂入口。", {
        errorCode: "OPENAI_GATEWAY_TIMEOUT",
        durationMs: Date.now() - startedAt
      }, 7);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

main().catch((error) => {
  fail("GPT 网关预检发生网络或运行时错误。", {
    errorCode: "OPENAI_GATEWAY_NETWORK_FAILED",
    errorName: error instanceof Error ? error.name : "Error",
    errorMessage: error instanceof Error ? error.message : String(error)
  }, 8);
});
