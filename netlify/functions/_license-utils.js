const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");
const { getStore } = require("@netlify/blobs");

const STORE_NAME = "aikb-license-store";
const LICENSE_PATTERN = /^AIKB-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const DASH_PATTERN = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D]/g;
const LOCAL_LICENSE_SECRET = "local-dev-aikb-license-secret-do-not-use-in-production";

let prismaClient;

function isProduction() {
  return process.env.NODE_ENV === "production" || process.env.CONTEXT === "production";
}

function json(statusCode, data) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(data)
  };
}

function normalizeCode(code) {
  const value = String(code ?? "")
    .normalize("NFKC")
    .trim()
    .toUpperCase()
    .replace(DASH_PATTERN, "-")
    .replace(/\s+/g, "")
    .replace(/-+/g, "-");

  const compact = value.replace(/-/g, "");
  const normalized = /^AIKB[A-Z0-9]{12}$/.test(compact)
    ? `AIKB-${compact.slice(4, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}`
    : value;

  if (!LICENSE_PATTERN.test(normalized)) {
    throw new Error("卡密格式不正确，应为 AIKB-XXXX-XXXX-XXXX。");
  }

  return normalized;
}

function getLicenseSecret() {
  const secret = process.env.LICENSE_SECRET?.trim();

  if (secret) {
    return secret;
  }

  if (isProduction()) {
    throw new Error("LICENSE_SECRET 未配置，无法校验卡密。");
  }

  console.warn("[license] LICENSE_SECRET is missing. Using local development fallback.");
  return LOCAL_LICENSE_SECRET;
}

function hashCode(code) {
  return crypto.createHmac("sha256", getLicenseSecret()).update(normalizeCode(code)).digest("hex");
}

function getLicenseStore() {
  return getStore(STORE_NAME);
}

async function readJson(event) {
  try {
    return JSON.parse(event.body || "{}");
  } catch {
    throw new Error("请求体必须是 JSON。");
  }
}

function requireMethod(event, method) {
  if (event.httpMethod !== method) {
    throw new Error(`只支持 ${method} 请求。`);
  }
}

function getHeader(event, name) {
  const lowerName = name.toLowerCase();
  const headers = event.headers || {};
  return headers[name] || headers[lowerName] || "";
}

function requireAdmin(event) {
  const expected = process.env.ADMIN_TOKEN?.trim();

  if (!expected) {
    throw new Error("ADMIN_TOKEN 未配置，无法使用卡密后台。");
  }

  const actual = String(getHeader(event, "x-admin-token") || "").trim();

  if (!actual || actual !== expected) {
    throw new Error("管理员 token 无效。");
  }
}

function randomGroup() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let value = "";

  for (let index = 0; index < 4; index += 1) {
    value += alphabet[crypto.randomInt(0, alphabet.length)];
  }

  return value;
}

function generateCode() {
  return `AIKB-${randomGroup()}-${randomGroup()}-${randomGroup()}`;
}

async function getLicenseByCode(code) {
  const normalized = normalizeCode(code);
  const codeHash = hashCode(normalized);
  const store = getLicenseStore();
  const record = await store.get(`license:${codeHash}`, { type: "json" });

  return {
    normalized,
    codeHash,
    record
  };
}

async function setLicenseRecord(codeHash, record) {
  const store = getLicenseStore();
  await store.setJSON(`license:${codeHash}`, record);
}

async function writeActivationLog(entry) {
  const store = getLicenseStore();
  const timestamp = new Date().toISOString();
  const suffix = crypto.randomUUID();
  await store.setJSON(`activation:${timestamp}:${suffix}`, {
    ...entry,
    created_at: timestamp
  });
}

function getPrisma() {
  if (!process.env.DATABASE_URL?.trim()) {
    return null;
  }

  prismaClient ??= new PrismaClient();
  return prismaClient;
}

async function markUserLicenseActivated(userId) {
  const value = String(userId ?? "").trim();

  if (!value) {
    return {
      updated: false,
      reason: "missing_user_id"
    };
  }

  const prisma = getPrisma();

  if (!prisma) {
    return {
      updated: false,
      reason: "missing_database_url"
    };
  }

  const result = await prisma.user.updateMany({
    where: {
      OR: [
        { id: value },
        { phone: value }
      ]
    },
    data: {
      licenseActivated: true
    }
  });

  return {
    updated: result.count > 0,
    count: result.count,
    reason: result.count > 0 ? null : "user_not_found"
  };
}

function toPublicLicense(record) {
  return {
    display_code: record.display_code,
    status: record.status,
    created_at: record.created_at,
    expires_at: record.expires_at ?? null,
    used_at: record.used_at ?? null,
    used_by: record.used_by ?? null,
    code_hash_prefix: record.code_hash_prefix
  };
}

function logFunctionError(scope, error, extra = {}) {
  console.error(`[${scope}]`, {
    message: error instanceof Error ? error.message : String(error),
    ...extra
  });
}

module.exports = {
  STORE_NAME,
  generateCode,
  getLicenseByCode,
  getLicenseStore,
  hashCode,
  isProduction,
  json,
  logFunctionError,
  markUserLicenseActivated,
  normalizeCode,
  readJson,
  requireAdmin,
  requireMethod,
  setLicenseRecord,
  toPublicLicense,
  writeActivationLog
};
