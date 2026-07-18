#!/usr/bin/env node

import { tsImport } from "tsx/esm/api";
import { pathToFileURL } from "url";

const { assertLocalQaDatabaseOrThrow, isLocalQaDatabaseUrl } = await tsImport(
  "../../lib/config/qa-mode.ts",
  import.meta.url
);

const QA_DISPLAY_NAME = "qa_ingest_admin_202606";
const QA_LOGIN_PHONE = "13920260601";
const QA_PASSWORD = "Qa12345678!";
const LOCAL_DB_NAME = "xt_local_license";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

assertLocalQaDatabaseOrThrow();

function readArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));

  return found ? found.slice(prefix.length).trim() : fallback;
}

function normalizeBaseUrl(value) {
  return (value || "http://localhost:3021").replace(/\/+$/, "");
}

function resolveLoginIdentifier(value) {
  const candidate = (value || "").trim();

  if (!candidate || candidate === QA_DISPLAY_NAME) {
    return QA_LOGIN_PHONE;
  }

  return candidate;
}

function endpoint(baseUrl, pathname) {
  return new URL(pathname, `${baseUrl}/`).toString();
}

function getSetCookies(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }

  const combined = headers.get("set-cookie");

  if (!combined) {
    return [];
  }

  return combined.split(/,(?=\s*[^;,]+=)/g).map((cookie) => cookie.trim()).filter(Boolean);
}

function addCookiesToJar(jar, setCookies) {
  for (const cookie of setCookies) {
    const pair = cookie.split(";")[0]?.trim();
    const index = pair?.indexOf("=") ?? -1;

    if (!pair || index <= 0) {
      continue;
    }

    jar.set(pair.slice(0, index), pair.slice(index + 1));
  }
}

function cookieHeader(jar) {
  return Array.from(jar.entries()).map(([name, value]) => `${name}=${value}`).join("; ");
}

async function readJson(response) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { parseFailed: true, text };
  }
}

function unwrapApiData(json) {
  return json && typeof json === "object" && "data" in json ? json.data : json;
}

function assertServerLocalDatabase(info) {
  const database = info?.database;
  const host = database?.host;
  const dbName = database?.database;
  const port = database?.port || "5432";
  const syntheticUrl = host && dbName ? `postgresql://postgres:postgres@${host}:${port}/${dbName}` : "";

  if (!database?.present || !LOCAL_HOSTS.has(host) || dbName !== LOCAL_DB_NAME || !isLocalQaDatabaseUrl(syntheticUrl)) {
    throw new Error("SERVER_DATABASE_NOT_LOCAL");
  }
}

export async function verifyAdminIngestAuth({
  baseUrl = normalizeBaseUrl(readArg("base-url")),
  username = readArg("username", QA_DISPLAY_NAME),
  password = readArg("password", QA_PASSWORD)
} = {}) {
  const loginIdentifier = resolveLoginIdentifier(username);
  const jar = new Map();

  const dbHealth = await fetch(endpoint(baseUrl, "/api/health/db"), {
    headers: { "Cache-Control": "no-store" }
  });
  const dbJson = await readJson(dbHealth);
  assertServerLocalDatabase(dbJson);

  const loginResponse = await fetch(endpoint(baseUrl, "/api/ingest/auth/login"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify({
      phone: loginIdentifier,
      username: loginIdentifier,
      password
    })
  });
  const loginJson = await readJson(loginResponse);
  const setCookies = getSetCookies(loginResponse.headers);

  addCookiesToJar(jar, setCookies);

  if (!loginResponse.ok) {
    throw Object.assign(new Error("LOGIN_FAILED"), {
      details: {
        status: loginResponse.status,
        response: loginJson
      }
    });
  }

  if (setCookies.length === 0 || jar.size === 0) {
    throw new Error("NO_SET_COOKIE");
  }

  const authMeResponse = await fetch(endpoint(baseUrl, "/api/ingest/auth/me"), {
    headers: {
      Cookie: cookieHeader(jar),
      "Cache-Control": "no-store"
    }
  });
  const authMeJson = await readJson(authMeResponse);
  const authMe = unwrapApiData(authMeJson);

  if (!authMe?.authenticated) {
    throw Object.assign(new Error("AUTH_ME_NOT_AUTHENTICATED"), {
      details: { status: authMeResponse.status, response: authMeJson }
    });
  }

  if (!authMe?.hasIngestAccess) {
    throw Object.assign(new Error("NO_INGEST_ACCESS"), {
      details: { status: authMeResponse.status, response: authMeJson }
    });
  }

  const adminResponse = await fetch(endpoint(baseUrl, "/admin-ingest?app=ingest-admin&platform=web"), {
    redirect: "manual",
    headers: {
      Cookie: cookieHeader(jar),
      "Cache-Control": "no-store"
    }
  });

  if (adminResponse.status >= 300 && adminResponse.status < 400) {
    const location = adminResponse.headers.get("location") || "";

    if (/no-access|ingest\/activate|ingest\/login/i.test(location)) {
      throw Object.assign(new Error("ADMIN_INGEST_NOT_ACCESSIBLE"), {
        details: { status: adminResponse.status, location }
      });
    }
  }

  const result = {
    baseUrl,
    cookieJar: jar,
    cookieHeader: cookieHeader(jar),
    loginStatus: loginResponse.status,
    setCookie: setCookies.length > 0 ? "present" : "missing",
    authMeAuthenticated: authMe.authenticated === true,
    hasIngestAccess: authMe.hasIngestAccess === true,
    role: authMe.role ?? null,
    roles: Array.isArray(authMe.roles) ? authMe.roles : [],
    redirectTarget: authMe.redirectTarget ?? null,
    adminIngestStatus: adminResponse.status,
    adminIngestLocation: adminResponse.headers.get("location") || null,
    loginResponse: loginJson
  };

  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyAdminIngestAuth()
    .then((result) => {
      console.log("AUTH_QA_OK");
      console.log(`loginStatus: ${result.loginStatus}`);
      console.log(`setCookie: ${result.setCookie}`);
      console.log(`setCookiePresent: ${result.setCookie === "present"}`);
      console.log(`authMeAuthenticated: ${result.authMeAuthenticated}`);
      console.log(`hasIngestAccess: ${result.hasIngestAccess}`);
      console.log(`role: ${result.role}`);
      console.log(`roles: ${result.roles.join(",")}`);
      console.log(`redirectTarget: ${result.redirectTarget}`);
      console.log(`adminIngestStatus: ${result.adminIngestStatus}`);
    })
    .catch((error) => {
      console.error("AUTH_QA_FAILED");
      console.error(error instanceof Error ? error.message : String(error));
      if (error?.details) {
        console.error(JSON.stringify(error.details, null, 2).slice(0, 3000));
      }
      process.exitCode = 1;
    });
}
