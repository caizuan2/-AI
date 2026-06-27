const LOCAL_QA_DB_NAME = "xt_local_license";
const LOCAL_QA_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const LOCAL_QA_PORTS = new Set(["54330", "5432"]);
const FORBIDDEN_REMOTE_MARKERS = [
  "supabase.com",
  "pooler.supabase.com",
  "aws-1-ap-southeast"
];

export function isQaModeEnabled() {
  return process.env.QA_MODE === "true";
}

export function isLocalQaDatabaseUrl(url: string | undefined) {
  if (!url) {
    return false;
  }

  const normalizedUrl = url.toLowerCase();

  if (FORBIDDEN_REMOTE_MARKERS.some((marker) => normalizedUrl.includes(marker))) {
    return false;
  }

  try {
    const parsed = new URL(url);
    const databaseName = parsed.pathname.replace(/^\/+/, "");
    const port = parsed.port || "5432";

    return (
      parsed.protocol.startsWith("postgres") &&
      LOCAL_QA_HOSTS.has(parsed.hostname) &&
      LOCAL_QA_PORTS.has(port) &&
      databaseName === LOCAL_QA_DB_NAME
    );
  } catch {
    return false;
  }
}

export function assertLocalQaDatabaseOrThrow() {
  if (!isQaModeEnabled()) {
    throw new Error("QA_MODE_DISABLED");
  }

  if (!isLocalQaDatabaseUrl(process.env.DATABASE_URL)) {
    throw new Error("QA_MODE_REQUIRES_LOCAL_DOCKER_DB");
  }
}

export function describeQaDatabaseUrl(url: string | undefined) {
  if (!url) {
    return {
      present: false,
      host: null,
      port: null,
      database: null,
      isLocalQaDatabase: false
    };
  }

  try {
    const parsed = new URL(url);

    return {
      present: true,
      host: parsed.hostname,
      port: parsed.port || "5432",
      database: parsed.pathname.replace(/^\/+/, ""),
      isLocalQaDatabase: isLocalQaDatabaseUrl(url)
    };
  } catch {
    return {
      present: true,
      host: null,
      port: null,
      database: null,
      isLocalQaDatabase: false
    };
  }
}
