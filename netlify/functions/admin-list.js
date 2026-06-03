const {
  getLicenseStore,
  json,
  logFunctionError,
  requireAdmin,
  requireMethod,
  toPublicLicense
} = require("./_license-utils");

async function listLicenseRecords(limit) {
  const store = getLicenseStore();
  const { blobs } = await store.list({ prefix: "license:" });
  const items = [];

  for (const blob of blobs.slice(0, Math.min(blobs.length, 1000))) {
    const record = await store.get(blob.key, { type: "json" });

    if (record) {
      items.push(toPublicLicense(record));
    }
  }

  return items
    .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
    .slice(0, limit);
}

exports.handler = async (event) => {
  try {
    requireMethod(event, "GET");
    requireAdmin(event);

    const limit = Math.min(Math.max(Number(event.queryStringParameters?.limit ?? 200), 1), 500);
    const licenses = await listLicenseRecords(limit);

    return json(200, {
      ok: true,
      licenses
    });
  } catch (error) {
    logFunctionError("admin-list", error);

    return json(500, {
      ok: false,
      message: error instanceof Error ? error.message : "加载卡密列表失败。"
    });
  }
};
