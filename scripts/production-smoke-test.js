#!/usr/bin/env node

const [, , rawBaseUrl, adminToken] = process.argv;

function usage() {
  console.error("Usage: node scripts/production-smoke-test.js https://your-site.netlify.app YOUR_ADMIN_TOKEN");
  process.exit(1);
}

if (!rawBaseUrl || !adminToken) {
  usage();
}

const baseUrl = rawBaseUrl.replace(/\/+$/, "");

function randomMissingCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const group = () => Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  return `AIKB-${group()}-${group()}-${group()}`;
}

async function requestJson(label, path, options = {}) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(async () => ({ raw: await response.text().catch(() => "") }));

  if (!response.ok || body.ok === false) {
    const error = new Error(`${label} failed`);
    error.details = {
      url,
      status: response.status,
      body
    };
    throw error;
  }

  return body;
}

function assertStep(condition, label, detail) {
  if (!condition) {
    const error = new Error(`${label} failed`);
    error.details = detail;
    throw error;
  }
}

async function main() {
  console.log(`[1/6] health: ${baseUrl}/api/admin/health`);
  const health = await requestJson("health", "/api/admin/health", {
    method: "POST",
    headers: {
      "x-admin-token": adminToken
    },
    body: "{}"
  });
  assertStep(health.ok === true && health.storage === "netlify-blobs", "health assertion", health);

  console.log("[2/6] generate one license");
  const generated = await requestJson("generate", "/api/admin/generate", {
    method: "POST",
    headers: {
      "x-admin-token": adminToken
    },
    body: JSON.stringify({ count: 1 })
  });
  const code = generated.codes?.[0];
  assertStep(typeof code === "string" && code.startsWith("AIKB-"), "generate assertion", generated);

  console.log(`[3/6] check generated license: ${code}`);
  const checked = await requestJson("check-code", "/api/admin/check-code", {
    method: "POST",
    headers: {
      "x-admin-token": adminToken
    },
    body: JSON.stringify({ code })
  });
  assertStep(checked.exists === true && checked.status === "unused", "check-code assertion", checked);

  console.log("[4/6] activate generated license");
  const activated = await requestJson("activate", "/api/activate", {
    method: "POST",
    body: JSON.stringify({
      code,
      user_id: `smoke-test-${Date.now()}`
    })
  });
  assertStep(activated.ok === true && activated.message === "激活成功。", "activate assertion", activated);

  console.log("[5/6] activate duplicate license");
  const duplicateResponse = await fetch(`${baseUrl}/api/activate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      code,
      user_id: `smoke-test-${Date.now()}`
    })
  });
  const duplicate = await duplicateResponse.json().catch(() => null);
  assertStep(duplicate?.ok === false && duplicate?.message === "卡密已使用。", "duplicate assertion", {
    status: duplicateResponse.status,
    body: duplicate
  });

  console.log("[6/6] activate missing license");
  const missingCode = randomMissingCode();
  const missingResponse = await fetch(`${baseUrl}/api/activate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      code: missingCode,
      user_id: `smoke-test-${Date.now()}`
    })
  });
  const missing = await missingResponse.json().catch(() => null);
  assertStep(missing?.ok === false && missing?.message === "卡密不存在。", "missing assertion", {
    status: missingResponse.status,
    body: missing,
    missingCode
  });

  console.log("Production smoke test passed.");
  console.log(`Generated smoke-test license: ${code}`);
}

main().catch((error) => {
  console.error(error.message);

  if (error.details) {
    console.error(JSON.stringify(error.details, null, 2));
  }

  process.exit(1);
});
