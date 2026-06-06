import { getStore } from "@netlify/blobs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORE_NAME = "aikb-licenses";

function responseHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,x-admin-token",
    "Cache-Control": "no-store"
  };
}

function json(status: number, data: Record<string, unknown>) {
  return NextResponse.json(data, {
    status,
    headers: responseHeaders()
  });
}

function getManualBlobsConfig() {
  const siteID = (
    process.env.NETLIFY_BLOBS_SITE_ID ||
    process.env.NETLIFY_SITE_ID ||
    process.env.SITE_ID ||
    ""
  ).trim();
  const token = (
    process.env.NETLIFY_BLOBS_TOKEN ||
    process.env.NETLIFY_AUTH_TOKEN ||
    ""
  ).trim();

  return {
    siteID,
    token,
    hasSiteID: Boolean(siteID),
    hasToken: Boolean(token)
  };
}

function getLicenseStore() {
  const manualConfig = getManualBlobsConfig();

  if (manualConfig.hasSiteID && manualConfig.hasToken) {
    return getStore({
      name: STORE_NAME,
      siteID: manualConfig.siteID,
      token: manualConfig.token
    });
  }

  return getStore(STORE_NAME);
}

async function handleHealth(request: Request) {
  const serverAdminToken = process.env.ADMIN_TOKEN?.trim();
  const licenseSecret = process.env.LICENSE_SECRET?.trim();
  const requestAdminToken = request.headers.get("x-admin-token")?.trim() || "";

  if (!serverAdminToken) {
    return json(500, {
      ok: false,
      error: "MISSING_ADMIN_TOKEN",
      message: "Netlify 环境变量 ADMIN_TOKEN 未配置"
    });
  }

  if (!licenseSecret) {
    return json(500, {
      ok: false,
      error: "MISSING_LICENSE_SECRET",
      message: "Netlify 环境变量 LICENSE_SECRET 未配置"
    });
  }

  if (requestAdminToken !== serverAdminToken) {
    return json(401, {
      ok: false,
      error: "INVALID_ADMIN_TOKEN",
      message: "管理员 token 错误",
      token_length: requestAdminToken.length,
      has_server_admin_token: Boolean(serverAdminToken)
    });
  }

  try {
    const manualBlobsConfig = getManualBlobsConfig();
    const store = getLicenseStore();
    const healthKey = `health-test:${Date.now()}`;
    const healthValue = {
      checked_at: new Date().toISOString(),
      deploy_id: process.env.DEPLOY_ID || null
    };

    await store.setJSON(healthKey, healthValue);
    const saved = await store.get(healthKey, { type: "json" }) as { checked_at?: string } | null;
    const storeTestWriteRead = Boolean(saved?.checked_at === healthValue.checked_at);

    if (!storeTestWriteRead) {
      return json(500, {
        ok: false,
        error: "BLOBS_TEST_FAILED",
        message: "Netlify Blobs 写入后读取结果不一致",
        runtime: "next-app-route",
        storage: "netlify-blobs",
        store_name: STORE_NAME,
        has_NETLIFY_BLOBS_SITE_ID: manualBlobsConfig.hasSiteID,
        has_NETLIFY_BLOBS_TOKEN: manualBlobsConfig.hasToken,
        store_test_write_read: false
      });
    }

    return json(200, {
      ok: true,
      service: "admin-health",
      timestamp: new Date().toISOString(),
      runtime: "next-app-route",
      storage: "netlify-blobs",
      store_name: STORE_NAME,
      has_LICENSE_SECRET: true,
      has_ADMIN_TOKEN: true,
      has_NETLIFY_BLOBS_SITE_ID: manualBlobsConfig.hasSiteID,
      has_NETLIFY_BLOBS_TOKEN: manualBlobsConfig.hasToken,
      store_test_write_read: true,
      deploy_id: process.env.DEPLOY_ID || null,
      site_name: process.env.SITE_NAME || null
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: "BLOBS_TEST_FAILED",
      message: error instanceof Error ? error.message : "Netlify Blobs 写读测试失败",
      runtime: "next-app-route",
      storage: "netlify-blobs",
      store_name: STORE_NAME,
      has_NETLIFY_BLOBS_SITE_ID: getManualBlobsConfig().hasSiteID,
      has_NETLIFY_BLOBS_TOKEN: getManualBlobsConfig().hasToken,
      store_test_write_read: false
    });
  }
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: responseHeaders()
  });
}

export function GET(request: Request) {
  return handleHealth(request);
}

export function POST(request: Request) {
  return handleHealth(request);
}
