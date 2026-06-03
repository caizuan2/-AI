const {
  getLicenseByCode,
  json,
  logFunctionError,
  readJson,
  requireMethod,
  setLicenseRecord,
  toPublicLicense,
  writeActivationLog
} = require("./_license-utils");
const { markUserLicenseActivated } = require("./_user-sync");

exports.handler = async (event) => {
  try {
    requireMethod(event, "POST");

    const body = await readJson(event);
    const code = typeof body.code === "string" ? body.code : "";
    const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
    const { normalized, codeHash, record } = await getLicenseByCode(code);
    const codeHashPrefix = codeHash.slice(0, 12);

    if (!record) {
      await writeActivationLog({
        result: "missing",
        user_id: userId || null,
        code_hash_prefix: codeHashPrefix
      });

      return json(404, {
        ok: false,
        message: "卡密不存在。"
      });
    }

    if (record.status === "used") {
      return json(409, {
        ok: false,
        message: "卡密已使用。"
      });
    }

    if (record.status === "disabled") {
      return json(403, {
        ok: false,
        message: "卡密已禁用。"
      });
    }

    if (record.expires_at && new Date(record.expires_at).getTime() <= Date.now()) {
      return json(410, {
        ok: false,
        message: "卡密已过期。"
      });
    }

    let userActivation = {
      updated: false,
      reason: "not_checked"
    };

    try {
      userActivation = await markUserLicenseActivated(userId);
    } catch (activationError) {
      logFunctionError("activate-user-sync", activationError, {
        code_hash_prefix: codeHashPrefix,
        user_id: userId || null
      });
      userActivation = {
        updated: false,
        reason: "database_sync_failed"
      };
    }

    const usedAt = new Date().toISOString();
    const updated = {
      ...record,
      status: "used",
      used_by: userId,
      used_at: usedAt
    };

    await setLicenseRecord(codeHash, updated);
    await writeActivationLog({
      result: "activated",
      user_id: userId,
      code_hash_prefix: codeHashPrefix,
      used_at: usedAt
    });

    return json(200, {
      ok: true,
      message: "激活成功。",
      code: normalized,
      licenseActivated: true,
      user_license_updated: userActivation.updated,
      license: toPublicLicense(updated)
    });
  } catch (error) {
    logFunctionError("activate", error);

    return json(500, {
      ok: false,
      message: error instanceof Error ? error.message : "卡密激活失败。"
    });
  }
};
