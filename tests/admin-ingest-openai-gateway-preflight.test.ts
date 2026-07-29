import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";

type GatewayMode = "success" | "region_unsupported";

function runPreflight(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  flagsEnabled?: boolean;
  allowEnabled?: boolean;
}) {
  return new Promise<{
    exitCode: number | null;
    stdout: string;
    stderr: string;
  }>((resolve, reject) => {
    const args = [
      "--import",
      "tsx",
      path.resolve("scripts/qa/verify-admin-ingest-openai-gateway.ts"),
      "--allow-local-http"
    ];

    if (input.allowEnabled) {
      args.push("--allow-enabled");
    }

    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        OPENAI_API_KEY: input.apiKey,
        OPENAI_BASE_URL: input.baseUrl,
        OPENAI_MODEL: input.model,
        AI_ENABLE_GPT_55: input.flagsEnabled ? "true" : "false",
        NEXT_PUBLIC_AI_ENABLE_GPT_55: input.flagsEnabled ? "true" : "false"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (exitCode) => {
      resolve({ exitCode, stdout, stderr });
    });
  });
}

async function main() {
  const apiKey = "test-gateway-secret-token";
  const model = "gpt-test-model";
  let mode: GatewayMode = "success";
  let requestCount = 0;

  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk) => {
      chunks.push(Buffer.from(chunk));
    });
    request.on("end", () => {
      requestCount += 1;
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
        model?: unknown;
      };

      assert.equal(request.method, "POST");
      assert.equal(request.url, "/v1/responses");
      assert.equal(request.headers.authorization, `Bearer ${apiKey}`);
      assert.equal(body.model, model);

      response.setHeader("Content-Type", "application/json");

      if (mode === "region_unsupported") {
        response.statusCode = 403;
        response.end(JSON.stringify({
          error: {
            type: "request_forbidden",
            code: "unsupported_country_region_territory",
            message: "Country, region, or territory not supported"
          }
        }));
        return;
      }

      response.statusCode = 200;
      response.end(JSON.stringify({
        id: "resp_gateway_preflight_test",
        model,
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: "OK"
              }
            ]
          }
        ]
      }));
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address();

    assert.ok(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}/v1`;
    const success = await runPreflight({ baseUrl, apiKey, model });

    assert.equal(success.exitCode, 0);
    assert.match(success.stdout, /OPENAI_GATEWAY_PREFLIGHT_OK/);
    assert.match(success.stdout, /"requestedProvider": "openai"/);
    assert.match(success.stdout, /"actualProvider": "openai"/);
    assert.match(success.stdout, /"fallbackUsed": false/);
    assert.match(success.stdout, /"verificationPhase": "pre_enable"/);
    assert.doesNotMatch(success.stdout, new RegExp(apiKey));
    assert.equal(success.stderr, "");

    const unsafeEnabled = await runPreflight({
      baseUrl,
      apiKey,
      model,
      flagsEnabled: true
    });

    assert.equal(unsafeEnabled.exitCode, 2);
    assert.match(unsafeEnabled.stderr, /OPENAI_GATEWAY_UNSAFE_ENABLEMENT/);
    assert.equal(requestCount, 1);

    const postEnable = await runPreflight({
      baseUrl,
      apiKey,
      model,
      flagsEnabled: true,
      allowEnabled: true
    });

    assert.equal(postEnable.exitCode, 0);
    assert.match(postEnable.stdout, /"verificationPhase": "post_enable"/);
    assert.match(postEnable.stdout, /"serverFlagEnabled": true/);
    assert.match(postEnable.stdout, /"publicFlagEnabled": true/);
    assert.doesNotMatch(postEnable.stdout, new RegExp(apiKey));

    mode = "region_unsupported";
    const regionFailure = await runPreflight({ baseUrl, apiKey, model });

    assert.equal(regionFailure.exitCode, 3);
    assert.match(regionFailure.stderr, /OPENAI_GATEWAY_PREFLIGHT_FAILED/);
    assert.match(regionFailure.stderr, /OPENAI_REGION_UNSUPPORTED/);
    assert.match(regionFailure.stderr, /unsupported_country_region_territory/);
    assert.doesNotMatch(regionFailure.stderr, new RegExp(apiKey));
    assert.equal(requestCount, 3);

    console.log("Admin ingest OpenAI gateway preflight tests passed.");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
