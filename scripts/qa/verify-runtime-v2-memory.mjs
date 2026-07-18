#!/usr/bin/env node

const DEFAULT_USER_BASE_URL = "http://127.0.0.1:3051";
const DEFAULT_QUERY = "客户说考虑考虑怎么回复？";

function argValue(name) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) {
    return inline.slice(name.length + 1);
  }

  const index = process.argv.indexOf(name);

  return index >= 0 ? process.argv[index + 1] : undefined;
}

function normalizeBaseUrl(value) {
  return (value || DEFAULT_USER_BASE_URL).replace(/\/+$/, "");
}

function readQuery() {
  return argValue("--query") || process.env.QA_CHAT_MESSAGE || DEFAULT_QUERY;
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

async function checkPublicMarket(baseUrl) {
  const result = await request(`${baseUrl}/api/public/expert-market`, {
    headers: { Accept: "application/json" },
  });

  return {
    ok: result.response.ok && result.isJson,
    status: result.response.status,
    isJson: result.isJson,
    body: result.json,
  };
}

async function checkChat(baseUrl, jar, query) {
  const result = await request(`${baseUrl}/api/ai/chat/ask`, {
    method: "POST",
    headers: {
      Accept: "text/event-stream, application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: query,
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
    };
  }

  const finalData = result.contentType.toLowerCase().includes("text/event-stream")
    ? parseSseFinal(result.text)
    : result.json;
  const runtimeOutput = finalData?.runtime_output ?? finalData?.data?.runtime_output ?? finalData;

  return {
    ok: result.response.ok && Boolean(runtimeOutput),
    authRequired: false,
    status: result.response.status,
    contentType: result.contentType,
    runtimeOutput,
  };
}

function checkRuntimeFields(runtimeOutput) {
  return {
    runtimeVersion: runtimeOutput?.runtimeVersion === "v2",
    customerCopy: typeof runtimeOutput?.customerCopy === "string" && runtimeOutput.customerCopy.trim().length > 0,
    traceId: typeof runtimeOutput?.traceId === "string" && runtimeOutput.traceId.trim().length > 0,
    memoryAppliedField: typeof runtimeOutput?.memoryApplied === "boolean",
    usedMemoryIdsField: Array.isArray(runtimeOutput?.usedMemoryIds),
    memoryTraceField: Array.isArray(runtimeOutput?.memoryTrace),
  };
}

async function main() {
  const baseUrl = normalizeBaseUrl(argValue("--user-base") || argValue("--base") || process.env.QA_USER_BASE_URL || process.env.QA_BASE_URL);
  const query = readQuery();
  const jar = new Map();
  const publicMarket = await checkPublicMarket(baseUrl);
  const auth = await login(baseUrl, jar);
  const chat = await checkChat(baseUrl, jar, query);
  const fields = checkRuntimeFields(chat.runtimeOutput);
  const fieldPass = Object.values(fields).every(Boolean);
  const result = !publicMarket.ok
    ? "FAIL"
    : chat.authRequired || auth.skipped
      ? "AUTH_REQUIRED_MANUAL_LOGIN"
      : chat.ok && fieldPass
        ? "PASS"
        : "FAIL";

  console.log("RUNTIME_V2_MEMORY_CHECK:");
  console.log(`USER_BASE=${baseUrl}`);
  console.log(`PUBLIC_OK=${publicMarket.ok}`);
  console.log(`PUBLIC_STATUS=${publicMarket.status}`);
  console.log(`CHAT_STATUS=${chat.status}`);
  console.log(`AUTH_REQUIRED=${chat.authRequired || auth.skipped}`);
  console.log(`RUNTIME_VERSION=${fields.runtimeVersion}`);
  console.log(`CUSTOMER_COPY=${fields.customerCopy}`);
  console.log(`TRACE_ID=${fields.traceId}`);
  console.log(`MEMORY_APPLIED_FIELD=${fields.memoryAppliedField}`);
  console.log(`USED_MEMORY_IDS_FIELD=${fields.usedMemoryIdsField}`);
  console.log(`MEMORY_TRACE_FIELD=${fields.memoryTraceField}`);
  console.log(`RESULT=${result}`);

  if (result === "FAIL") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("RUNTIME_V2_MEMORY_CHECK_FAILED", error);
  process.exitCode = 1;
});
