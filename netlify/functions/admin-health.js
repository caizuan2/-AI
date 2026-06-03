const {
  getLicenseStore,
  json,
  logFunctionError,
  requireAdmin
} = require("./_license-utils");

exports.handler = async (event) => {
  try {
    requireAdmin(event);

    const store = getLicenseStore();
    const healthKey = `health:${Date.now()}`;
    const healthValue = {
      checked_at: new Date().toISOString(),
      deploy_id: process.env.DEPLOY_ID ?? null
    };

    await store.setJSON(healthKey, healthValue);
    const saved = await store.get(healthKey, { type: "json" });

    return json(200, {
      ok: true,
      runtime: "netlify-functions",
      storage: "netlify-blobs",
      has_LICENSE_SECRET: Boolean(process.env.LICENSE_SECRET?.trim()),
      has_ADMIN_TOKEN: Boolean(process.env.ADMIN_TOKEN?.trim()),
      deploy_id: process.env.DEPLOY_ID ?? null,
      site_name: process.env.SITE_NAME ?? null,
      store_test_write_read: Boolean(saved?.checked_at === healthValue.checked_at)
    });
  } catch (error) {
    logFunctionError("admin-health", error);

    return json(500, {
      ok: false,
      runtime: "netlify-functions",
      storage: "netlify-blobs",
      has_LICENSE_SECRET: Boolean(process.env.LICENSE_SECRET?.trim()),
      has_ADMIN_TOKEN: Boolean(process.env.ADMIN_TOKEN?.trim()),
      store_test_write_read: false,
      message: error instanceof Error ? error.message : "卡密后台健康检查失败。"
    });
  }
};
