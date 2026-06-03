const {
  generateCode,
  getLicenseStore,
  hashCode,
  json,
  logFunctionError,
  normalizeCode,
  readJson,
  requireAdmin,
  requireMethod,
  setLicenseRecord
} = require("./_license-utils");

function parseCount(value) {
  const count = Number(value ?? 1);

  if (!Number.isInteger(count) || count < 1 || count > 5000) {
    throw new Error("生成数量必须是 1-5000 的整数。");
  }

  return count;
}

function parseExpiresAt(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("有效期格式不正确。");
  }

  return date.toISOString();
}

exports.handler = async (event) => {
  try {
    requireMethod(event, "POST");
    requireAdmin(event);

    const body = await readJson(event);
    const count = parseCount(body.count);
    const expiresAt = parseExpiresAt(body.expires_at ?? body.expiresAt);
    const store = getLicenseStore();
    const codes = [];
    const createdAt = new Date().toISOString();

    while (codes.length < count) {
      const code = normalizeCode(generateCode());
      const codeHash = hashCode(code);
      const existing = await store.get(`license:${codeHash}`, { type: "json" });

      if (existing) {
        continue;
      }

      const record = {
        code_hash: codeHash,
        code_hash_prefix: codeHash.slice(0, 12),
        display_code: code,
        status: "unused",
        created_at: createdAt,
        expires_at: expiresAt,
        used_at: null,
        used_by: null
      };

      await setLicenseRecord(codeHash, record);
      codes.push(code);
    }

    return json(200, {
      ok: true,
      codes,
      expires_at: expiresAt
    });
  } catch (error) {
    logFunctionError("admin-generate", error);

    return json(500, {
      ok: false,
      message: error instanceof Error ? error.message : "生成卡密失败。"
    });
  }
};
