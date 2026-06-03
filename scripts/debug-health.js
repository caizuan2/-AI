#!/usr/bin/env node

const [, , rawBaseUrl, adminToken] = process.argv;

if (!rawBaseUrl || !adminToken) {
  console.error("Usage: node scripts/debug-health.js https://your-site.netlify.app YOUR_ADMIN_TOKEN");
  process.exit(1);
}

const baseUrl = rawBaseUrl.replace(/\/+$/, "");
const requests = [
  ["GET", "/api/admin/health"],
  ["POST", "/api/admin/health"],
  ["GET", "/.netlify/functions/admin-health"],
  ["POST", "/.netlify/functions/admin-health"]
];

async function runRequest(method, path) {
  const url = `${baseUrl}${path}`;

  try {
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": adminToken
      },
      body: method === "POST" ? "{}" : undefined
    });
    const body = await response.text();

    console.log("=".repeat(80));
    console.log(`URL: ${url}`);
    console.log(`Method: ${method}`);
    console.log(`Status: ${response.status}`);
    console.log("Response body:");
    try {
      console.log(JSON.stringify(JSON.parse(body), null, 2));
    } catch {
      console.log(body || "(empty)");
    }
  } catch (error) {
    console.log("=".repeat(80));
    console.log(`URL: ${url}`);
    console.log(`Method: ${method}`);
    console.log("Status: NETWORK_ERROR");
    console.log("Response body:");
    console.log(error instanceof Error ? error.message : String(error));
  }
}

async function main() {
  for (const [method, path] of requests) {
    await runRequest(method, path);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
