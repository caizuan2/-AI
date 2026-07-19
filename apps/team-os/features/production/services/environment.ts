const SUPPORTED_AI_PROVIDERS = ["openai", "deepseek", "qwen"] as const;

type TeamOsAiProvider = typeof SUPPORTED_AI_PROVIDERS[number];

export type TeamOsEnvironmentCheck = {
  key: string;
  required: boolean;
  ok: boolean;
  message: string;
};

export type TeamOsEnvironmentReport = {
  ok: boolean;
  provider: TeamOsAiProvider | null;
  checks: TeamOsEnvironmentCheck[];
};

function valueOf(env: Record<string, string | undefined>, key: string) {
  return env[key]?.trim() ?? "";
}

function isPlaceholder(value: string) {
  return !value || /(?:replace|change|example|your-|dummy|sample|test-key|not-for-production|<[^>]+>)/i.test(value);
}

function validPostgresUrl(value: string) {
  try {
    const url = new URL(value);
    const hasTemplateToken = /(?:APP_USER|APP_PASSWORD|DB_HOST|APP_DATABASE|MIGRATION_USER|MIGRATION_PASSWORD)/i.test(value);
    return (
      (url.protocol === "postgres:" || url.protocol === "postgresql:")
      && Boolean(url.hostname)
      && !hasTemplateToken
    );
  } catch {
    return false;
  }
}

function validPublicAppUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const isExampleHost = hostname === "example.com" || hostname.endsWith(".example.com");
    const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
    return (
      url.protocol === "https:"
      && Boolean(hostname)
      && !isExampleHost
      && !isLocalHost
      && !url.username
      && !url.password
    );
  } catch {
    return false;
  }
}

export function isValidTeamOsEncryptionKey(value: string) {
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return true;
  }

  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) {
    return false;
  }

  try {
    const decoded = Buffer.from(value, "base64url");
    return decoded.length === 32 && decoded.toString("base64url") === value;
  } catch {
    return false;
  }
}

function check(input: TeamOsEnvironmentCheck) {
  return input;
}

export function validateTeamOsProductionEnvironment(
  env: Record<string, string | undefined> = process.env
): TeamOsEnvironmentReport {
  const providerValue = valueOf(env, "AI_PROVIDER").toLowerCase();
  const provider = SUPPORTED_AI_PROVIDERS.includes(providerValue as TeamOsAiProvider)
    ? providerValue as TeamOsAiProvider
    : null;
  const encryptionKey = valueOf(env, "ENCRYPTION_KEY");
  const legacyEncryptionKey = valueOf(env, "TEAM_OS_INTEGRATION_ENCRYPTION_KEY");
  const providerKey = provider === "openai"
    ? "OPENAI_API_KEY"
    : provider === "deepseek"
      ? "DEEPSEEK_API_KEY"
      : provider === "qwen"
        ? "QWEN_API_KEY"
        : null;

  const checks = [
    check({
      key: "NODE_ENV",
      required: true,
      ok: valueOf(env, "NODE_ENV") === "production",
      message: "生产发布必须设置为 production。"
    }),
    check({
      key: "DATABASE_URL",
      required: true,
      ok: validPostgresUrl(valueOf(env, "DATABASE_URL")),
      message: "必须是 PostgreSQL 连接地址；运行时建议使用连接池地址。"
    }),
    check({
      key: "DIRECT_URL",
      required: true,
      ok: validPostgresUrl(valueOf(env, "DIRECT_URL")),
      message: "受控迁移作业必须使用 PostgreSQL 直连地址。"
    }),
    check({
      key: "AI_PROVIDER",
      required: true,
      ok: provider !== null,
      message: "必须是 openai、deepseek 或 qwen。"
    }),
    check({
      key: "NEXT_PUBLIC_APP_URL",
      required: true,
      ok: validPublicAppUrl(valueOf(env, "NEXT_PUBLIC_APP_URL")),
      message: "生产环境必须使用不含凭据的 HTTPS 公网地址。"
    }),
    check({
      key: "APP_URL",
      required: true,
      ok: validPublicAppUrl(valueOf(env, "APP_URL")),
      message: "服务端回调地址必须使用不含凭据的 HTTPS 公网地址。"
    }),
    check({
      key: "SESSION_SECRET",
      required: true,
      ok: valueOf(env, "SESSION_SECRET").length >= 32 && !isPlaceholder(valueOf(env, "SESSION_SECRET")),
      message: "必须是至少 32 个字符的随机值。"
    }),
    check({
      key: "ENCRYPTION_KEY",
      required: true,
      ok: isValidTeamOsEncryptionKey(encryptionKey) && !isPlaceholder(encryptionKey),
      message: "必须是 32 字节 base64url 或 64 位十六进制密钥。"
    }),
    check({
      key: "TEAM_OS_INTEGRATION_ENCRYPTION_KEY",
      required: false,
      ok: !legacyEncryptionKey || (
        isValidTeamOsEncryptionKey(legacyEncryptionKey)
        && !isPlaceholder(legacyEncryptionKey)
      ),
      message: "旧变量可以留空；如保留则必须使用有效加密密钥。"
    }),
    check({
      key: "ENCRYPTION_KEY_CONSISTENCY",
      required: true,
      ok: !legacyEncryptionKey || legacyEncryptionKey === encryptionKey,
      message: "新旧加密变量同时存在时必须完全一致。"
    }),
    ...(["OPENAI_API_KEY", "DEEPSEEK_API_KEY", "QWEN_API_KEY"] as const).map((key) => {
      const required = key === providerKey || key === "OPENAI_API_KEY";
      const value = valueOf(env, key);
      return check({
        key,
        required,
        ok: required ? !isPlaceholder(value) : !value || !isPlaceholder(value),
        message: required
          ? key === "OPENAI_API_KEY" && provider !== "openai"
            ? "当前知识向量能力必须配置 OPENAI_API_KEY。"
            : `当前 AI_PROVIDER 必须配置 ${key}。`
          : "未启用该提供商时可以留空；如填写则不能使用示例值。"
      });
    })
  ];

  return {
    ok: checks.every((item) => item.ok),
    provider,
    checks
  };
}

export function formatTeamOsEnvironmentReport(report: TeamOsEnvironmentReport) {
  return report.checks.map((item) => (
    `${item.ok ? "PASS" : "FAIL"} ${item.key}: ${item.message}`
  ));
}
