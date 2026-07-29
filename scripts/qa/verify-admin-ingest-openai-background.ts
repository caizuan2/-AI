import "dotenv/config";

import {
  matchesOpenAIRequestedModel,
  readOpenAIProviderError,
  validateOpenAIGatewayBaseUrl
} from "../../lib/enterprise/openai-gateway-readiness";

const VERIFY_TIMEOUT_MS = 150_000;
const POLL_INTERVAL_MS = 1_200;

function readEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function readPayload(bodyText: string) {
  try {
    const parsed = JSON.parse(bodyText) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function readOutputText(payload: Record<string, unknown>) {
  if (!Array.isArray(payload.output)) {
    return "";
  }

  return payload.output
    .flatMap((item) => {
      const content = item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>).content
        : null;
      return Array.isArray(content) ? content : [];
    })
    .map((item) => {
      const text = item && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>).text
        : null;
      return typeof text === "string" ? text.trim() : "";
    })
    .filter(Boolean)
    .join("\n");
}

function fail(message: string, details: Record<string, unknown>): never {
  console.error("OPENAI_GATEWAY_BACKGROUND_VERIFY_FAILED");
  console.error(JSON.stringify({ message, ...details }, null, 2));
  process.exit(1);
}

async function main() {
  const apiKey = readEnv("OPENAI_API_KEY");
  const baseUrlValidation = validateOpenAIGatewayBaseUrl(readEnv("OPENAI_BASE_URL"));
  const requestedModel = readEnv("OPENAI_MODEL");

  if (!apiKey || !requestedModel || !baseUrlValidation.ok) {
    fail("后台正文验收配置不完整。", {
      apiKeyConfigured: Boolean(apiKey),
      requestedModel: requestedModel || null,
      baseUrlValid: baseUrlValidation.ok
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  const startedAt = Date.now();
  let responseId = "";
  let pollCount = 0;

  try {
    const initialResponse = await fetch(`${baseUrlValidation.normalizedBaseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify({
        model: requestedModel,
        instructions: "你是企业沟通顾问，请输出结构清晰、可执行的中文建议。",
        input: "请为一位想重新开始做副业的宝妈设计一份循序渐进的沟通与行动方案，包含定位、信任建立、需求诊断、低风险试跑、复盘和长期跟进。",
        reasoning: {
          effort: "high"
        },
        text: {
          verbosity: "medium"
        },
        max_output_tokens: 10000,
        stream: false
      }),
      signal: controller.signal
    });
    let bodyText = await initialResponse.text();
    let payload = readPayload(bodyText);

    if (!initialResponse.ok) {
      const providerError = readOpenAIProviderError(bodyText);
      fail("后台正文创建失败。", {
        status: initialResponse.status,
        providerErrorType: providerError.type,
        providerErrorCode: providerError.code,
        durationMs: Date.now() - startedAt
      });
    }

    responseId = typeof payload.id === "string" ? payload.id.trim() : "";
    let status = typeof payload.status === "string" ? payload.status.trim().toLowerCase() : "";

    if (!/^resp_[A-Za-z0-9_-]{8,200}$/.test(responseId)) {
      fail("后台正文创建未返回合法 response ID。", {
        status: status || null,
        durationMs: Date.now() - startedAt
      });
    }

    while (status === "queued" || status === "in_progress") {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      pollCount += 1;

      const pollResponse = await fetch(`${baseUrlValidation.normalizedBaseUrl}/responses/${encodeURIComponent(responseId)}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Cache-Control": "no-store"
        },
        signal: controller.signal
      });
      bodyText = await pollResponse.text();
      payload = readPayload(bodyText);

      if (!pollResponse.ok) {
        const providerError = readOpenAIProviderError(bodyText);
        fail("后台正文轮询失败。", {
          status: pollResponse.status,
          providerErrorType: providerError.type,
          providerErrorCode: providerError.code,
          pollCount,
          durationMs: Date.now() - startedAt
        });
      }

      status = typeof payload.status === "string" ? payload.status.trim().toLowerCase() : "";
    }

    const actualModel = typeof payload.model === "string" ? payload.model.trim() : "";
    const outputText = readOutputText(payload);
    const modelIdentityMatched = matchesOpenAIRequestedModel(requestedModel, actualModel);

    if (status !== "completed" || !modelIdentityMatched || !outputText) {
      fail("后台正文身份或正文验收失败。", {
        status: status || null,
        requestedModel,
        actualModel: actualModel || null,
        modelIdentityMatched,
        contentLength: outputText.length,
        pollCount,
        durationMs: Date.now() - startedAt
      });
    }

    console.log("OPENAI_GATEWAY_BACKGROUND_VERIFY_OK");
    console.log(JSON.stringify({
      requestedProvider: "openai",
      actualProvider: "openai",
      requestedModel,
      actualModel,
      modelIdentityMatched,
      responseIdPresent: true,
      contentLength: outputText.length,
      fallbackUsed: false,
      pollCount,
      durationMs: Date.now() - startedAt
    }, null, 2));
  } catch (error) {
    if (responseId) {
      try {
        await fetch(`${baseUrlValidation.normalizedBaseUrl}/responses/${encodeURIComponent(responseId)}/cancel`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Cache-Control": "no-store"
          },
          signal: AbortSignal.timeout(5_000)
        });
      } catch {
        // Cancellation is best effort after a failed verifier.
      }
    }

    fail("后台正文验收超时或网络失败。", {
      errorName: error instanceof Error ? error.name : "Error",
      durationMs: Date.now() - startedAt,
      responseIdPresent: Boolean(responseId),
      pollCount
    });
  } finally {
    clearTimeout(timeout);
  }
}

void main();
