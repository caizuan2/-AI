#!/usr/bin/env node

import { verifyAdminIngestAuth } from "./verify-admin-ingest-auth.mjs";
import { pathToFileURL } from "url";

const QA_PROMPT = "QA验证：请用一句话说明今天投喂链路是否正常。";

function readArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));

  return found ? found.slice(prefix.length).trim() : fallback;
}

function endpoint(baseUrl, pathname) {
  return new URL(pathname, `${baseUrl.replace(/\/+$/, "")}/`).toString();
}

async function readJson(response) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { parseFailed: true, text };
  }
}

function readText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function pickContent(json) {
  return readText(json?.content)
    || readText(json?.answer)
    || readText(json?.reply)
    || readText(json?.replyMarkdown)
    || readText(json?.data?.content)
    || readText(json?.data?.answer)
    || readText(json?.data?.reply)
    || readText(json?.data?.replyMarkdown);
}

function requireSuccessPayload(response, json) {
  const content = pickContent(json);
  const ok = json?.ok === true || json?.success === true || json?.data?.success === true;

  if (response.status !== 200 || !ok || !content) {
    throw Object.assign(new Error("INGEST_GPT_QA_FAILED"), {
      details: {
        status: response.status,
        ok: json?.ok ?? null,
        success: json?.success ?? json?.data?.success ?? null,
        response: json
      }
    });
  }

  return { ok, content };
}

export async function verifyAdminIngestGptFlow() {
  const baseUrl = readArg("base-url", "http://localhost:3063");
  const username = readArg("username", "qa_ingest_admin_202606");
  const password = readArg("password", "Qa12345678!");
  const auth = await verifyAdminIngestAuth({ baseUrl, username, password });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);

  try {
    const payload = {
      input: QA_PROMPT,
      message: QA_PROMPT,
      prompt: QA_PROMPT,
      modelMode: "highest",
      modelProvider: "deepseek",
      selectedModelLabel: "DeepSeek-V4-Pro",
      preferredModel: "DeepSeek-V4-Pro",
      agentId: "qa-admin-ingest-agent-jiangshi",
      knowledgeBaseId: "qa-kb-jiangshi",
      kb_id: "qa-kb-jiangshi",
      namespace: "agent:qa-admin-ingest-agent-jiangshi:kb:qa-kb-jiangshi",
      expertId: "qa-expert-jiangshi",
      expert_id: "qa-expert-jiangshi",
      tenantId: "qa-local-tenant",
      tenant_id: "qa-local-tenant",
      agentName: "讲事业导师",
      agentDescription: "QA 本地投喂链路验证 Agent",
      platform: "web",
      syncTarget: ["web"],
      recentMessages: [],
      previousKnowledgeDrafts: [],
      recentTrainingRecords: [],
      qaMetadata: {
        qaLocalOnly: true,
        createdBy: "worktree2-local-validation"
      }
    };

    const response = await fetch(endpoint(baseUrl, "/api/admin/kb/ingest/gpt"), {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        Cookie: auth.cookieHeader
      },
      body: JSON.stringify(payload)
    });
    const json = await readJson(response);
    const { ok, content } = requireSuccessPayload(response, json);

    return {
      auth,
      status: response.status,
      ok,
      success: json?.success ?? json?.data?.success ?? null,
      provider: json?.provider ?? json?.data?.provider ?? null,
      actualModel: json?.actualModel ?? json?.data?.actualModel ?? json?.model ?? null,
      contentLength: content.length,
      fallback: json?.fallbackUsed ?? json?.fallback ?? json?.data?.fallbackUsed ?? null,
      response: json
    };
  } finally {
    clearTimeout(timeout);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyAdminIngestGptFlow()
    .then((result) => {
      console.log("INGEST_GPT_QA_OK");
      console.log(`status: ${result.status}`);
      console.log(`ok: ${result.ok}`);
      console.log(`success: ${result.success}`);
      console.log(`provider: ${result.provider}`);
      console.log(`actualModel: ${result.actualModel}`);
      console.log(`contentLength: ${result.contentLength}`);
      console.log(`fallback: ${result.fallback}`);
    })
    .catch((error) => {
      console.error("INGEST_GPT_QA_FAILED");
      console.error(error instanceof Error ? error.message : String(error));
      if (error?.details) {
        console.error(JSON.stringify(error.details, null, 2).slice(0, 4000));
      }
      process.exitCode = 1;
    });
}
