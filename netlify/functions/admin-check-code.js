const {
  getLicenseByCode,
  json,
  logFunctionError,
  readJson,
  requireAdmin,
  requireMethod
} = require("./_license-utils");

exports.handler = async (event) => {
  try {
    requireMethod(event, "POST");
    requireAdmin(event);

    const body = await readJson(event);
    const { normalized, codeHash, record } = await getLicenseByCode(body.code);

    return json(200, {
      ok: true,
      normalized_code: normalized,
      code_hash_prefix: codeHash.slice(0, 12),
      exists: Boolean(record),
      status: record?.status ?? null,
      expires_at: record?.expires_at ?? null,
      used_by: record?.used_by ?? null,
      used_at: record?.used_at ?? null,
      created_at: record?.created_at ?? null,
      display_code: record?.display_code ?? null
    });
  } catch (error) {
    logFunctionError("admin-check-code", error);

    return json(500, {
      ok: false,
      message: error instanceof Error ? error.message : "查询卡密失败。"
    });
  }
};
