const { Client } = require("pg");

function normalizePhone(input) {
  const value = String(input ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/[\s-]+/g, "");

  if (/^1[3-9]\d{9}$/.test(value)) {
    return `+86${value}`;
  }

  if (/^861[3-9]\d{9}$/.test(value)) {
    return `+${value}`;
  }

  return value;
}

function buildUserCandidates(value) {
  const normalized = normalizePhone(value);

  return Array.from(new Set([
    value,
    normalized,
    normalized.startsWith("+") ? normalized.slice(1) : normalized,
    normalized.startsWith("+86") ? normalized.slice(3) : normalized
  ].filter(Boolean)));
}

function buildDatabaseUrl() {
  const raw = process.env.DATABASE_URL?.trim();

  if (!raw) {
    return null;
  }

  const url = new URL(raw);

  for (const key of ["pgbouncer", "connection_limit", "pool_timeout", "schema", "sslmode"]) {
    url.searchParams.delete(key);
  }

  return url.toString();
}

async function markUserLicenseActivated(userId) {
  const value = String(userId ?? "").trim();

  if (!value) {
    return {
      updated: false,
      reason: "missing_user_id"
    };
  }

  const connectionString = buildDatabaseUrl();

  if (!connectionString) {
    return {
      updated: false,
      reason: "missing_database_url"
    };
  }

  const candidates = buildUserCandidates(value);
  const client = new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    const result = await client.query(
      `
      UPDATE "users"
      SET "licenseActivated" = true
      WHERE "id" = ANY($1::text[])
         OR "phone" = ANY($1::text[])
      RETURNING "id"
      `,
      [candidates]
    );

    return {
      updated: result.rowCount > 0,
      count: result.rowCount,
      reason: result.rowCount > 0 ? null : "user_not_found"
    };
  } catch (error) {
    return {
      updated: false,
      reason: "database_sync_failed",
      message: error instanceof Error ? error.message : String(error)
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

module.exports = {
  markUserLicenseActivated
};
