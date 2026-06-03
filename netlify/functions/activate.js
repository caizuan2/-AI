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

function normalizeUserId(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/[\s-]+/g, "");
}

function isSameUser(left, right) {
  const normalizedLeft = normalizeUserId(left);
  const normalizedRight = normalizeUserId(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  return normalizedLeft === normalizedRight ||
    normalizedLeft.replace(/^\+/, "") === normalizedRight.replace(/^\+/, "") ||
    normalizedLeft.replace(/^\+?86/, "") === normalizedRight.replace(/^\+?86/, "");
}

async function syncUserForActivation(userId, codeHashPrefix) {
  try {
    return await markUserLicenseActivated(userId);
  } catch (activationError) {
    logFunctionError("activate-user-sync", activationError, {
      code_hash_prefix: codeHashPrefix,
      user_id: userId || null
    });

    return {
      updated: false,
      reason: "database_sync_failed"
    };
  }
}

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
      if (isSameUser(record.used_by, userId)) {
        const userActivation = await syncUserForActivation(userId, codeHashPrefix);

        if (userActivation.updated) {
          await writeActivationLog({
            result: "reactivated_existing_user",
            user_id: userId,
            code_hash_prefix: codeHashPrefix,
            used_at: record.used_at ?? null
          });

          return json(200, {
            ok: true,
            message: "激活成功。",
            code: normalized,
            licenseActivated: true,
            user_license_updated: true,
            license: toPublicLicense(record)
          });
        }

        return json(500, {
          ok: false,
          message: "卡密已使用在当前账号，但账号激活状态同步失败，请稍后重试。",
          error: "USER_LICENSE_SYNC_FAILED",
          user_sync_reason: userActivation.reason,
          user_sync_message: userActivation.message
        });
      }

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

    const userActivation = await syncUserForActivation(userId, codeHashPrefix);

    if (!userActivation.updated) {
      return json(500, {
        ok: false,
        message: "账号激活状态同步失败，卡密尚未消耗，请稍后重试。",
        error: "USER_LICENSE_SYNC_FAILED",
        user_sync_reason: userActivation.reason,
        user_sync_message: userActivation.message
      });
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
