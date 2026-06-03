const { getStore } = require("@netlify/blobs");
const {
  STORE_NAME,
  json,
  logFunctionError
} = require("./_license-utils");

function optionsResponse() {
  return {
    statusCode: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,x-admin-token",
      "Cache-Control": "no-store"
    },
    body: ""
  };
}

function getHeader(event, name) {
  const lowerName = name.toLowerCase();
  const headers = event.headers || {};
  return headers[name] || headers[lowerName] || "";
}

function isAllowedMethod(method) {
  return method === "GET" || method === "POST";
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return optionsResponse();
  }

  if (!isAllowedMethod(event.httpMethod)) {
    return json(405, {
      ok: false,
      error: "METHOD_NOT_ALLOWED",
      message: "只支持 GET、POST、OPTIONS 请求。"
    });
  }

  const serverAdminToken = process.env.ADMIN_TOKEN?.trim();
  const licenseSecret = process.env.LICENSE_SECRET?.trim();
  const requestAdminToken = String(getHeader(event, "x-admin-token") || "").trim();

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
    const store = getStore(STORE_NAME);
    const healthKey = `health-test:${Date.now()}`;
    const healthValue = {
      checked_at: new Date().toISOString(),
      deploy_id: process.env.DEPLOY_ID || null
    };

    await store.setJSON(healthKey, healthValue);
    const saved = await store.get(healthKey, { type: "json" });
    const storeTestWriteRead = Boolean(saved?.checked_at === healthValue.checked_at);

    if (!storeTestWriteRead) {
      return json(500, {
        ok: false,
        error: "BLOBS_TEST_FAILED",
        message: "Netlify Blobs 写入后读取结果不一致",
        runtime: "netlify-functions",
        storage: "netlify-blobs",
        store_test_write_read: false
      });
    }

    return json(200, {
      ok: true,
      runtime: "netlify-functions",
      storage: "netlify-blobs",
      has_LICENSE_SECRET: true,
      has_ADMIN_TOKEN: true,
      store_test_write_read: true,
      deploy_id: process.env.DEPLOY_ID || null,
      site_name: process.env.SITE_NAME || null
    });
  } catch (error) {
    logFunctionError("admin-health", error);

    return json(500, {
      ok: false,
      error: "BLOBS_TEST_FAILED",
      message: error instanceof Error ? error.message : "Netlify Blobs 写读测试失败",
      runtime: "netlify-functions",
      storage: "netlify-blobs",
      store_test_write_read: false
    });
  }
};
