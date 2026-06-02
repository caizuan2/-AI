export interface SafeDatabaseUrlInfo {
  present: boolean;
  invalid?: boolean;
  protocol?: string;
  host?: string;
  port?: string | null;
  database?: string | null;
  usernamePrefix?: string | null;
  hasPgbouncer?: boolean;
  connectionLimit?: string | null;
  poolTimeout?: string | null;
  sslmode?: string | null;
  isSupabasePooler?: boolean;
}

export function getSafeDatabaseUrlInfo(rawUrl = process.env.DATABASE_URL): SafeDatabaseUrlInfo {
  if (!rawUrl?.trim()) {
    return { present: false };
  }

  try {
    const url = new URL(rawUrl);
    const port = url.port || null;
    const host = url.hostname;

    return {
      present: true,
      protocol: url.protocol.replace(":", ""),
      host,
      port,
      database: url.pathname.replace(/^\//, "") || null,
      usernamePrefix: url.username ? `${url.username.slice(0, 12)}...` : null,
      hasPgbouncer: url.searchParams.get("pgbouncer") === "true",
      connectionLimit: url.searchParams.get("connection_limit"),
      poolTimeout: url.searchParams.get("pool_timeout"),
      sslmode: url.searchParams.get("sslmode"),
      isSupabasePooler: host.includes("pooler.supabase.com") || port === "6543"
    };
  } catch {
    return {
      present: true,
      invalid: true
    };
  }
}

export function getDatabasePoolerWarnings(info = getSafeDatabaseUrlInfo()) {
  const warnings: string[] = [];

  if (!info.present) {
    warnings.push("DATABASE_URL 未配置。");
    return warnings;
  }

  if (info.invalid) {
    warnings.push("DATABASE_URL 不是合法 URL。");
    return warnings;
  }

  if (!info.isSupabasePooler) {
    warnings.push("DATABASE_URL 看起来不是 Supabase Pooler 完整连接串。");
  }

  if (info.port !== "6543") {
    warnings.push("Supabase Transaction Pooler 通常应使用 6543 端口。");
  }

  if (!info.hasPgbouncer) {
    warnings.push("DATABASE_URL 建议包含 pgbouncer=true。");
  }

  if (!info.connectionLimit) {
    warnings.push("DATABASE_URL 建议包含 connection_limit=1。");
  }

  if (!info.poolTimeout) {
    warnings.push("DATABASE_URL 建议包含 pool_timeout=20。");
  }

  return warnings;
}

export function getDatabaseUrlWithPoolerParams(rawUrl = process.env.DATABASE_URL) {
  if (!rawUrl?.trim()) {
    return rawUrl;
  }

  try {
    const url = new URL(rawUrl);
    const isSupabasePooler = url.hostname.includes("pooler.supabase.com") || url.port === "6543";

    if (!isSupabasePooler) {
      return rawUrl;
    }

    if (!url.searchParams.has("pgbouncer")) {
      url.searchParams.set("pgbouncer", "true");
    }

    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", "1");
    }

    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", "20");
    }

    return url.toString();
  } catch {
    return rawUrl;
  }
}
