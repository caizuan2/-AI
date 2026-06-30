#!/usr/bin/env node

const DEFAULT_USER_BASE_URL = "http://127.0.0.1:3051";
const DEFAULT_INGEST_BASE_URL = "http://localhost:3063";
const DEFAULT_QUERY = "客户说考虑考虑怎么回复？";

function argValue(name) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) {
    return inline.slice(name.length + 1);
  }

  const index = process.argv.indexOf(name);

  return index >= 0 ? process.argv[index + 1] : undefined;
}

function normalizeBaseUrl(value, fallback) {
  return (value || fallback).replace(/\/+$/, "");
}

function mergeCookies(headers, jar) {
  const setCookie = headers.getSetCookie?.() ?? [];

  for (const cookie of setCookie) {
    const [pair] = cookie.split(";");
    const [name, value] = pair.split("=");

    if (name && value) {
      jar.set(name.trim(), value.trim());
    }
  }
}

function cookieHeader(jar) {
  return Array.from(jar.entries()).map(([name, value]) => `${name}=${value}`).join("; ");
}

async function request(url, options = {}, jar = new Map()) {
  const headers = new Headers(options.headers ?? {});
  const cookie = cookieHeader(jar);

  if (cookie) {
    headers.set("Cookie", cookie);
  }

  const response = await fetch(url, {
    ...options,
    headers,
    redirect: options.redirect ?? "manual",
  });

  mergeCookies(response.headers, jar);

  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return {
    response,
    contentType,
    text,
    json,
    isJson: contentType.toLowerCase().includes("application/json") || Boolean(json),
  };
}

async function requestPage(url) {
  const response = await fetch(url, { redirect: "manual" }).catch(() => null);
  const status = response?.status ?? 0;
  const ok = Boolean(response) && (status === 200 || status === 307 || status === 308);

  return { ok, status };
}

async function requestJsonHealth(url) {
  const result = await request(url, {
    headers: { Accept: "application/json" },
  }).catch((error) => ({
    response: { ok: false, status: 0 },
    contentType: "",
    text: String(error?.message || error),
    json: null,
    isJson: false,
  }));

  return {
    ok: result.response.ok && result.isJson,
    status: result.response.status,
    isJson: result.isJson,
    body: result.json,
  };
}

async function login(baseUrl, jar) {
  const phone = argValue("--phone") || process.env.QA_USER_PHONE;
  const password = argValue("--password") || process.env.QA_USER_PASSWORD;

  if (!phone || !password) {
    return { skipped: true, ok: false, reason: "QA_CREDENTIALS_MISSING" };
  }

  const result = await request(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ phone, username: phone, password }),
  }, jar);

  return {
    skipped: false,
    ok: result.response.ok && result.isJson,
    status: result.response.status,
    isJson: result.isJson,
    body: result.json,
  };
}

async function checkSession(baseUrl, jar) {
  const result = await request(`${baseUrl}/api/user/conversation-features`, {
    headers: { Accept: "application/json" },
  }, jar);

  return {
    ok: result.response.ok,
    status: result.response.status,
    isJson: result.isJson,
    authRequired: result.response.status === 401 || result.response.status === 403,
  };
}

function parseSseFinal(text) {
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    if (!line.startsWith("data: ")) {
      continue;
    }

    const payload = line.slice(6).trim();

    if (!payload || payload === "[DONE]") {
      continue;
    }

    try {
      const event = JSON.parse(payload);

      if (event?.type === "final") {
        return event.data ?? event;
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function checkChat(baseUrl, jar) {
  const result = await request(`${baseUrl}/api/ai/chat/ask`, {
    method: "POST",
    headers: {
      Accept: "text/event-stream, application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: process.env.QA_CHAT_MESSAGE || DEFAULT_QUERY,
      intent: "qa",
      knowledgeBaseId: process.env.QA_KB_ID || undefined,
      agentId: process.env.QA_AGENT_ID || undefined,
      namespace: process.env.QA_NAMESPACE || undefined,
    }),
  }, jar);

  if (result.response.status === 401 || result.response.status === 403) {
    return {
      ok: false,
      authRequired: true,
      status: result.response.status,
      contentType: result.contentType,
      runtimeOutput: null,
      fields: null,
    };
  }

  const finalData = result.contentType.toLowerCase().includes("text/event-stream")
    ? parseSseFinal(result.text)
    : result.json;
  const runtimeOutput = finalData?.runtime_output ?? finalData?.data?.runtime_output ?? finalData;
  const fields = {
    runtimeVersion: runtimeOutput?.runtimeVersion === "v2",
    customerCopy: typeof runtimeOutput?.customerCopy === "string" && runtimeOutput.customerCopy.trim().length > 0,
    traceId: typeof runtimeOutput?.traceId === "string" && runtimeOutput.traceId.trim().length > 0,
    memoryAppliedField: typeof runtimeOutput?.memoryApplied === "boolean",
    usedMemoryIdsField: Array.isArray(runtimeOutput?.usedMemoryIds),
    memoryTraceField: Array.isArray(runtimeOutput?.memoryTrace),
    sourcesField: Array.isArray(runtimeOutput?.sources),
  };
  const ok = result.response.ok && Object.values(fields).every(Boolean);

  return {
    ok,
    authRequired: false,
    status: result.response.status,
    contentType: result.contentType,
    runtimeOutput,
    fields,
  };
}

async function checkPublicHealth(userBase, ingestBase) {
  const userExpertMarket = await requestJsonHealth(`${userBase}/api/public/expert-market`);
  const userLogin = await requestPage(`${userBase}/login`);
  const userChat = await requestPage(`${userBase}/app/chat`);
  const ingestAdmin = await requestPage(`${ingestBase}/admin-ingest?app=ingest-admin&platform=web`);
  const ingestLogin = await requestPage(`${ingestBase}/ingest/login`);
  const ingestFallbackLogin = ingestLogin.ok ? ingestLogin : await requestPage(`${ingestBase}/login`);
  const ingestExpertMarket = await requestJsonHealth(`${ingestBase}/api/public/expert-market`);
  const ingestOptionalOk = ingestExpertMarket.status === 0 || ingestExpertMarket.status === 404 || ingestExpertMarket.ok;

  return {
    ok: userExpertMarket.ok && userLogin.ok && userChat.ok && ingestAdmin.ok && ingestFallbackLogin.ok && ingestOptionalOk,
    userExpertMarket,
    userLogin,
    userChat,
    ingestAdmin,
    ingestLogin,
    ingestFallbackLogin,
    ingestExpertMarket,
  };
}

async function checkIngestAuth(ingestBase) {
  const result = await requestJsonHealth(`${ingestBase}/api/ingest/auth/me`);

  if (result.status === 401 || result.status === 403 || result.status === 404 || result.status === 0) {
    return {
      ok: false,
      skipped: true,
      reason: "INGEST_AUTH_REQUIRED",
      status: result.status,
    };
  }

  return {
    ok: result.ok,
    skipped: false,
    reason: result.ok ? "INGEST_AUTH_OK" : "INGEST_AUTH_FAILED",
    status: result.status,
  };
}

async function main() {
  const userBase = normalizeBaseUrl(
    argValue("--user-base") || argValue("--base") || process.env.QA_USER_BASE_URL || process.env.QA_BASE_URL,
    DEFAULT_USER_BASE_URL,
  );
  const ingestBase = normalizeBaseUrl(
    argValue("--ingest-base") || process.env.QA_INGEST_BASE_URL,
    DEFAULT_INGEST_BASE_URL,
  );
  const jar = new Map();
  const publicHealth = await checkPublicHealth(userBase, ingestBase);
  const auth = await login(userBase, jar);
  const session = auth.skipped ? { ok: false, skipped: true, reason: "QA_CREDENTIALS_MISSING", status: 0 } : await checkSession(userBase, jar);
  const chat = auth.skipped ? { ok: false, authRequired: true, status: 0, fields: null } : await checkChat(userBase, jar);
  const ingest = await checkIngestAuth(ingestBase);
  const memoryOk = Boolean(chat.fields?.memoryAppliedField && chat.fields?.usedMemoryIdsField && chat.fields?.memoryTraceField);
  const authOk = !auth.skipped && auth.ok;
  const sessionOk = !auth.skipped && session.ok;
  const chatOk = !auth.skipped && chat.ok;
  const ingestOk = ingest.ok;
  const systemLinked = !publicHealth.ok
    ? "FALSE"
    : auth.skipped
      ? "PARTIAL_MANUAL_REQUIRED"
      : authOk && sessionOk && chatOk && memoryOk && ingestOk
        ? "TRUE"
        : "FALSE";
  const reason = !publicHealth.ok
    ? "PUBLIC_HEALTH_FAILED"
    : auth.skipped
      ? "QA_CREDENTIALS_MISSING"
      : !ingestOk && ingest.skipped
        ? ingest.reason
        : systemLinked === "TRUE"
          ? "ALL_CHECKS_PASSED"
          : "AUTH_OR_RUNTIME_CHECK_FAILED";

  console.log(`USER_BASE=${userBase}`);
  console.log(`INGEST_BASE=${ingestBase}`);
  console.log(`PUBLIC HEALTH OK: ${publicHealth.ok}`);
  console.log(`PUBLIC_USER_EXPERT_MARKET: status=${publicHealth.userExpertMarket.status} json=${publicHealth.userExpertMarket.isJson}`);
  console.log(`PUBLIC_LOGIN: status=${publicHealth.userLogin.status}`);
  console.log(`PUBLIC_APP_CHAT: status=${publicHealth.userChat.status}`);
  console.log(`PUBLIC_INGEST_ADMIN: status=${publicHealth.ingestAdmin.status}`);
  console.log(`PUBLIC_INGEST_LOGIN: status=${publicHealth.ingestLogin.status}`);
  console.log(`PUBLIC_INGEST_FALLBACK_LOGIN: status=${publicHealth.ingestFallbackLogin.status}`);
  console.log(`AUTH OK: ${auth.skipped ? "SKIPPED" : authOk}${auth.status ? ` status=${auth.status}` : ""}${auth.reason ? ` reason=${auth.reason}` : ""}`);
  console.log(`SESSION OK: ${sessionOk}${session.status ? ` status=${session.status}` : ""}${session.reason ? ` reason=${session.reason}` : ""}`);
  console.log(`CHAT OK: ${chatOk}${chat.status ? ` status=${chat.status}` : ""}`);
  console.log(`INGEST OK: ${ingestOk}${ingest.status ? ` status=${ingest.status}` : ""}${ingest.reason ? ` reason=${ingest.reason}` : ""}`);
  console.log(`MEMORY OK: ${memoryOk}`);
  console.log(`SYSTEM_LINKED: ${systemLinked}`);
  console.log(`REASON: ${reason}`);

  if (systemLinked === "FALSE") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("SYSTEM_LINKED_CHECK_FAILED", error);
  process.exitCode = 1;
});
