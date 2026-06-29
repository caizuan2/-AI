#!/usr/bin/env node

import { spawn } from "child_process";
import { pathToFileURL } from "url";
import { verifyAdminIngestAuth } from "./verify-admin-ingest-auth.mjs";

const CHAT_PROMPT = "QA验证：请用一句话说明用户端问答链路是否正常。";
const INGEST_PROMPT = "QA验证：请用一句话说明投喂端生成链路是否正常。";

function readArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));

  return found ? found.slice(prefix.length).trim() : fallback;
}

function endpoint(baseUrl, pathname) {
  return new URL(pathname, `${baseUrl.replace(/\/+$/, "")}/`).toString();
}

function runNodeScript(scriptPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(Object.assign(new Error("ENSURE_QA_USER_FAILED"), {
        details: {
          code,
          stdout,
          stderr
        }
      }));
    });
  });
}

async function readResponse(response) {
  const text = await response.text();

  try {
    return {
      text,
      json: text ? JSON.parse(text) : null
    };
  } catch {
    return {
      text,
      json: null
    };
  }
}

function readText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function pickContent(json, text = "") {
  return readText(json?.content)
    || readText(json?.answer)
    || readText(json?.reply)
    || readText(json?.replyMarkdown)
    || readText(json?.data?.content)
    || readText(json?.data?.answer)
    || readText(json?.data?.reply)
    || readText(json?.data?.replyMarkdown)
    || readText(json?.data?.result?.answer)
    || readText(text);
}

function containsForbiddenOrUnauthorized(text) {
  return /FORBIDDEN|UNAUTHORIZED|Forbidden|Unauthorized|当前账号不能访问|请先登录/i.test(text);
}

async function postJson(url, payload, cookieHeader, accept = "application/json") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        Accept: accept,
        Cookie: cookieHeader
      },
      body: JSON.stringify(payload)
    });
    const body = await readResponse(response);

    return {
      status: response.status,
      ...body
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyChat(baseUrl, cookieHeader) {
  const response = await postJson(endpoint(baseUrl, "/api/ai/chat/ask"), {
    question: CHAT_PROMPT,
    message: CHAT_PROMPT,
    text: CHAT_PROMPT,
    messages: [
      {
        role: "user",
        content: CHAT_PROMPT
      }
    ],
    app: "user",
    platform: "web",
    qaMetadata: {
      qaLocalOnly: true,
      createdBy: "worktree2-local-validation"
    }
  }, cookieHeader, "text/event-stream, application/json");
  const content = pickContent(response.json, response.text);
  const blocked = containsForbiddenOrUnauthorized(response.text);

  return {
    status: response.status,
    ok: response.status === 200 && !blocked && content.length > 0,
    blocked,
    contentLength: content.length,
    snippet: content.replace(/\s+/g, " ").slice(0, 180)
  };
}

async function verifyIngest(baseUrl, cookieHeader) {
  const response = await postJson(endpoint(baseUrl, "/api/admin/kb/ingest/gpt"), {
    input: INGEST_PROMPT,
    message: INGEST_PROMPT,
    prompt: INGEST_PROMPT,
    modelMode: "highest",
    modelProvider: "deepseek",
    selectedModelLabel: "DeepSeek-V4-Flash",
    preferredModel: "DeepSeek-V4-Flash",
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
  }, cookieHeader);
  const content = pickContent(response.json, response.text);
  const okFlag = response.json?.ok === true
    || response.json?.success === true
    || response.json?.data?.ok === true
    || response.json?.data?.success === true;
  const blocked = containsForbiddenOrUnauthorized(response.text);

  return {
    status: response.status,
    ok: response.status === 200 && okFlag && !blocked && content.length > 0,
    okFlag,
    blocked,
    provider: response.json?.provider ?? response.json?.data?.provider ?? null,
    actualModel: response.json?.actualModel ?? response.json?.data?.actualModel ?? response.json?.model ?? null,
    contentLength: content.length,
    snippet: content.replace(/\s+/g, " ").slice(0, 180)
  };
}

export async function verifySystemLinked() {
  const baseUrl = readArg("base-url", "http://localhost:3021");
  const username = readArg("username", "qa_ingest_admin_202606");
  const password = readArg("password", "Qa12345678!");

  await runNodeScript("scripts/qa/ensure-admin-ingest-qa-user.mjs");

  const auth = await verifyAdminIngestAuth({
    baseUrl,
    username,
    password
  });
  const chat = await verifyChat(baseUrl, auth.cookieHeader);
  const ingest = await verifyIngest(baseUrl, auth.cookieHeader);
  const authOk = auth.authMeAuthenticated === true && auth.hasIngestAccess === true;
  const sessionOk = authOk && chat.status !== 401 && ingest.status !== 401;
  const systemLinked = authOk && chat.ok && ingest.ok && sessionOk;

  return {
    baseUrl,
    auth,
    chat,
    ingest,
    authOk,
    chatOk: chat.ok,
    ingestOk: ingest.ok,
    sessionOk,
    systemLinked
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifySystemLinked()
    .then((result) => {
      console.log("SYSTEM_LINKED_QA_RESULT");
      console.log(`AUTH OK: ${result.authOk}`);
      console.log(`CHAT OK: ${result.chatOk}`);
      console.log(`INGEST OK: ${result.ingestOk}`);
      console.log(`SESSION OK: ${result.sessionOk}`);
      console.log(`SYSTEM_LINKED: ${result.systemLinked ? "TRUE" : "FALSE"}`);
      console.log(`loginStatus: ${result.auth.loginStatus}`);
      console.log(`setCookiePresent: ${result.auth.setCookie === "present"}`);
      console.log(`authMeAuthenticated: ${result.auth.authMeAuthenticated}`);
      console.log(`hasIngestAccess: ${result.auth.hasIngestAccess}`);
      console.log(`role: ${result.auth.role}`);
      console.log(`roles: ${result.auth.roles.join(",")}`);
      console.log(`adminIngestStatus: ${result.auth.adminIngestStatus}`);
      console.log(`chatStatus: ${result.chat.status}`);
      console.log(`chatContentLength: ${result.chat.contentLength}`);
      console.log(`chatBlocked: ${result.chat.blocked}`);
      console.log(`ingestStatus: ${result.ingest.status}`);
      console.log(`ingestOkFlag: ${result.ingest.okFlag}`);
      console.log(`ingestProvider: ${result.ingest.provider}`);
      console.log(`ingestActualModel: ${result.ingest.actualModel}`);
      console.log(`ingestContentLength: ${result.ingest.contentLength}`);
      console.log(`ingestBlocked: ${result.ingest.blocked}`);
    })
    .catch((error) => {
      console.error("SYSTEM_LINKED_QA_FAILED");
      console.error(error instanceof Error ? error.message : String(error));
      if (error?.details) {
        console.error(JSON.stringify(error.details, null, 2).slice(0, 4000));
      }
      process.exitCode = 1;
    });
}
