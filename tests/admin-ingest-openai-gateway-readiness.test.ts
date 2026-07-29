import assert from "node:assert/strict";

import {
  isOpenAIRegionUnsupportedResponse,
  matchesOpenAIRequestedModel,
  OPENAI_REGION_UNSUPPORTED_ERROR_CODE,
  readOpenAIProviderError,
  validateOpenAIGatewayBaseUrl
} from "../lib/enterprise/openai-gateway-readiness";
import { checkOpenAIIngestHealth } from "../lib/enterprise/openai-health-check";
import { normalizeOpenAIResponseError } from "../lib/enterprise/openai-ingest-client";

const originalFetch = globalThis.fetch;
const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  OPENAI_MODEL: process.env.OPENAI_MODEL
};

function restoreRuntime() {
  globalThis.fetch = originalFetch;

  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

async function main() {
  const official = validateOpenAIGatewayBaseUrl("https://api.openai.com/v1");

  assert.equal(official.ok, true);
  assert.equal(official.normalizedBaseUrl, "https://api.openai.com/v1");

  const customGateway = validateOpenAIGatewayBaseUrl("https://gpt-gateway.example.com/openai/v1/");

  assert.equal(customGateway.ok, true);
  assert.equal(customGateway.normalizedBaseUrl, "https://gpt-gateway.example.com/openai/v1");

  assert.equal(validateOpenAIGatewayBaseUrl("http://gpt-gateway.example.com/v1").ok, false);
  assert.equal(validateOpenAIGatewayBaseUrl("https://gpt-gateway.example.com/api").ok, false);
  assert.equal(validateOpenAIGatewayBaseUrl("https://user:password@gpt-gateway.example.com/v1").ok, false);
  assert.equal(validateOpenAIGatewayBaseUrl("https://gpt-gateway.example.com/v1?token=secret").ok, false);
  assert.equal(
    validateOpenAIGatewayBaseUrl("http://127.0.0.1:8787/v1", { allowLocalHttp: true }).ok,
    true
  );

  const regionBody = JSON.stringify({
    error: {
      type: "request_forbidden",
      code: "unsupported_country_region_territory",
      message: "Country, region, or territory not supported"
    }
  });
  const providerError = readOpenAIProviderError(regionBody);

  assert.equal(providerError.type, "request_forbidden");
  assert.equal(providerError.code, "unsupported_country_region_territory");
  assert.equal(isOpenAIRegionUnsupportedResponse(403, regionBody), true);
  assert.equal(isOpenAIRegionUnsupportedResponse(401, regionBody), false);
  assert.equal(
    isOpenAIRegionUnsupportedResponse(403, "unsupported_country_region_territory"),
    true
  );
  assert.equal(
    isOpenAIRegionUnsupportedResponse(403, JSON.stringify({
      error: {
        type: "invalid_request_error",
        code: "invalid_api_key",
        message: "Incorrect API key provided"
      }
    })),
    false
  );
  assert.equal(matchesOpenAIRequestedModel("gpt-5.5", "gpt-5.5"), true);
  assert.equal(matchesOpenAIRequestedModel("gpt-5.5", "gpt-5.5-2026-04-23"), true);
  assert.equal(matchesOpenAIRequestedModel("gpt-5.5-2026-04-23", "gpt-5.5-2026-04-23"), true);
  assert.equal(matchesOpenAIRequestedModel("gpt-5.5-2026-04-23", "gpt-5.5-2026-05-01"), false);
  assert.equal(matchesOpenAIRequestedModel("gpt-5.5", "gpt-5-mini-2026-04-23"), false);
  const normalizedRegionFailure = normalizeOpenAIResponseError(403, regionBody);

  assert.equal(normalizedRegionFailure.code, OPENAI_REGION_UNSUPPORTED_ERROR_CODE);
  assert.equal(normalizedRegionFailure.details.status, 403);
  assert.match(normalizedRegionFailure.message, /合规 GPT 网关/);
  assert.equal(
    normalizeOpenAIResponseError(403, JSON.stringify({
      error: {
        type: "invalid_request_error",
        code: "invalid_api_key",
        message: "Incorrect API key provided"
      }
    })).code,
    "OPENAI_API_KEY_MISSING"
  );

  Reflect.set(process.env, "NODE_ENV", "production");
  process.env.OPENAI_API_KEY = "test-openai-gateway-token";
  process.env.OPENAI_BASE_URL = "https://gpt-gateway.example.com/v1";
  process.env.OPENAI_MODEL = "gpt-test-model";

  const requests: Array<{ url: string; authorization: string }> = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: String(input),
      authorization: new Headers(init?.headers).get("Authorization") ?? ""
    });

    return new Response(regionBody, {
      status: 403,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }) as typeof fetch;

  const health = await checkOpenAIIngestHealth({
    preferredModel: "gpt-test-model",
    selectedModelLabel: "GPT-5.5 超高"
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://gpt-gateway.example.com/v1/responses");
  assert.equal(requests[0].authorization, "Bearer test-openai-gateway-token");
  assert.equal(health.ok, false);
  assert.equal(health.configured, true);
  assert.equal(health.requestTested, true);
  assert.equal(health.errorCode, OPENAI_REGION_UNSUPPORTED_ERROR_CODE);
  assert.match(health.message, /出口地区/);
  assert.equal(health.diagnostics.some((item) => item.includes("unsupported_country_region_territory")), true);

  process.env.OPENAI_BASE_URL = "http://gpt-gateway.example.com/v1";
  requests.length = 0;

  const insecureGatewayHealth = await checkOpenAIIngestHealth({
    preferredModel: "gpt-test-model"
  });

  assert.equal(requests.length, 0);
  assert.equal(insecureGatewayHealth.ok, false);
  assert.equal(insecureGatewayHealth.errorCode, "OPENAI_BASE_URL_INVALID");
  assert.match(insecureGatewayHealth.message, /HTTPS/);

  console.log("Admin ingest OpenAI gateway readiness tests passed.");
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(restoreRuntime);
