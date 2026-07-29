import assert from "node:assert/strict";
import handler, {
  __openAIGatewayTestHooks
} from "../deploy/openai-gateway-netlify/netlify/functions/responses";
import statusHandler from "../deploy/openai-gateway-netlify/netlify/functions/response-status";
import cancelHandler from "../deploy/openai-gateway-netlify/netlify/functions/response-cancel";

const originalFetch = globalThis.fetch;
const originalEnv = {
  OPENAI_GATEWAY_TOKEN: process.env.OPENAI_GATEWAY_TOKEN,
  OPENAI_GATEWAY_ALLOWED_IPS: process.env.OPENAI_GATEWAY_ALLOWED_IPS,
  OPENAI_GATEWAY_MODEL: process.env.OPENAI_GATEWAY_MODEL,
  OPENAI_UPSTREAM_API_KEY: process.env.OPENAI_UPSTREAM_API_KEY,
  OPENAI_UPSTREAM_BASE_URL: process.env.OPENAI_UPSTREAM_BASE_URL
};

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function readErrorCode(response: Response) {
  const payload = await response.json() as { error?: { code?: string } };
  return payload.error?.code;
}

async function run() {
  process.env.OPENAI_GATEWAY_TOKEN = "gateway-test-token";
  process.env.OPENAI_GATEWAY_ALLOWED_IPS = "47.238.0.23";
  process.env.OPENAI_GATEWAY_MODEL = "gpt-5.5";
  process.env.OPENAI_UPSTREAM_API_KEY = "upstream-test-key";
  process.env.OPENAI_UPSTREAM_BASE_URL = "https://api.openai.com/v1";

  assert.equal(
    __openAIGatewayTestHooks.resolveUpstreamResponsesUrl(),
    "https://api.openai.com/v1/responses"
  );

  process.env.OPENAI_UPSTREAM_BASE_URL = "https://example.com/v1";
  assert.equal(__openAIGatewayTestHooks.resolveUpstreamResponsesUrl(), null);
  process.env.OPENAI_UPSTREAM_BASE_URL = "https://api.openai.com/v1";

  const forbiddenIp = await handler(new Request("https://gateway.example/v1/responses", {
    method: "POST",
    headers: {
      Authorization: "Bearer gateway-test-token",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model: "gpt-5.5", input: "OK" })
  }), { ip: "203.0.113.8" });
  assert.equal(forbiddenIp.status, 403);
  assert.equal(await readErrorCode(forbiddenIp), "OPENAI_GATEWAY_SOURCE_FORBIDDEN");

  const invalidToken = await handler(new Request("https://gateway.example/v1/responses", {
    method: "POST",
    headers: {
      Authorization: "Bearer wrong-token",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model: "gpt-5.5", input: "OK" })
  }), { ip: "47.238.0.23" });
  assert.equal(invalidToken.status, 401);
  assert.equal(await readErrorCode(invalidToken), "OPENAI_GATEWAY_UNAUTHORIZED");

  const wrongModel = await handler(new Request("https://gateway.example/v1/responses", {
    method: "POST",
    headers: {
      Authorization: "Bearer gateway-test-token",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model: "gpt-other", input: "OK" })
  }), { ip: "47.238.0.23" });
  assert.equal(wrongModel.status, 400);
  assert.equal(await readErrorCode(wrongModel), "OPENAI_GATEWAY_MODEL_MISMATCH");

  let forwardedAuthorization = "";
  let forwardedBody = "";

  globalThis.fetch = async (_input, init) => {
    forwardedAuthorization = new Headers(init?.headers).get("authorization") ?? "";
    forwardedBody = typeof init?.body === "string" ? init.body : "";

    return Response.json({
      id: "resp_gateway_test",
      model: "gpt-5.5",
      output: [{
        type: "message",
        content: [{ type: "output_text", text: "OK" }]
      }]
    }, {
      headers: {
        "x-request-id": "req_gateway_test"
      }
    });
  };

  const success = await handler(new Request("https://gateway.example/v1/responses", {
    method: "POST",
    headers: {
      Authorization: "Bearer gateway-test-token",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-5.5",
      input: "OK",
      max_output_tokens: 64,
      stream: false
    })
  }), { ip: "47.238.0.23" });

  assert.equal(success.status, 200);
  assert.equal(forwardedAuthorization, "Bearer upstream-test-key");
  assert.equal(JSON.parse(forwardedBody).model, "gpt-5.5");
  assert.equal(success.headers.get("x-openai-request-id"), "req_gateway_test");
  const successPayload = await success.json() as { model?: string; output?: unknown[] };
  assert.equal(successPayload.model, "gpt-5.5");
  assert.ok(Array.isArray(successPayload.output) && successPayload.output.length > 0);

  globalThis.fetch = async (_input, init) => {
    forwardedBody = typeof init?.body === "string" ? init.body : "";

    return Response.json({
      id: "resp_background_gateway_123456",
      model: "gpt-5.5-2026-04-23",
      status: "queued",
      output: []
    });
  };

  const background = await handler(new Request("https://gateway.example/v1/responses", {
    method: "POST",
    headers: {
      Authorization: "Bearer gateway-test-token",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-5.5",
      instructions: "企业沟通顾问",
      input: "生成完整方案",
      reasoning: { effort: "high" },
      max_output_tokens: 1200,
      stream: false
    })
  }), { ip: "47.238.0.23" });
  const forwardedBackground = JSON.parse(forwardedBody) as {
    background?: boolean;
    store?: boolean;
    stream?: boolean;
  };

  assert.equal(background.status, 200);
  assert.equal(forwardedBackground.background, true);
  assert.equal(forwardedBackground.store, true);
  assert.equal(forwardedBackground.stream, false);

  const responseId = "resp_background_gateway_123456";
  const operations: string[] = [];

  globalThis.fetch = async (input, init) => {
    operations.push(`${init?.method ?? "GET"} ${String(input)}`);

    return Response.json({
      id: responseId,
      model: "gpt-5.5-2026-04-23",
      status: init?.method === "POST" ? "cancelled" : "completed",
      output: []
    });
  };

  const status = await statusHandler(new Request(`https://gateway.example/v1/responses/${responseId}`, {
    method: "GET",
    headers: {
      Authorization: "Bearer gateway-test-token"
    }
  }), {
    ip: "47.238.0.23",
    params: { responseId }
  });
  const cancelled = await cancelHandler(new Request(`https://gateway.example/v1/responses/${responseId}/cancel`, {
    method: "POST",
    headers: {
      Authorization: "Bearer gateway-test-token"
    }
  }), {
    ip: "47.238.0.23",
    params: { responseId }
  });

  assert.equal(status.status, 200);
  assert.equal(cancelled.status, 200);
  assert.deepEqual(operations, [
    `GET https://api.openai.com/v1/responses/${responseId}`,
    `POST https://api.openai.com/v1/responses/${responseId}/cancel`
  ]);
}

run()
  .then(() => {
    console.log("admin-ingest Netlify OpenAI gateway tests passed");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    globalThis.fetch = originalFetch;
    restoreEnv();
  });
