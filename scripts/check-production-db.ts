import { PrismaClient } from "@prisma/client";
import { getDatabaseUrl, getDatabaseUrlEnvName } from "@/lib/server-config-core";

const databaseUrl = getDatabaseUrl();
const databaseUrlEnvName = getDatabaseUrlEnvName();
const directUrl = process.env.DIRECT_URL?.trim();

if (!databaseUrl) {
  console.error("DATABASE_URL 未配置，或生产环境仍指向 localhost / 占位值。");
  process.exit(1);
}

process.env.DATABASE_URL = databaseUrl;

const prisma = new PrismaClient({
  log: ["error"]
});

function describeDatabaseUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname;
    const port = url.port || "default";
    const pooler = hostname.includes("pooler.supabase.com") || port === "6543";
    const pgbouncer = url.searchParams.get("pgbouncer") === "true";

    return {
      hostname,
      port,
      pooler,
      pgbouncer
    };
  } catch {
    return null;
  }
}

async function main() {
  const runtimeTarget = describeDatabaseUrl(databaseUrl);
  const migrationTarget = directUrl ? describeDatabaseUrl(directUrl) : null;

  console.log(`Using database env: ${databaseUrlEnvName ?? "DATABASE_URL"}`);
  console.log(`Runtime DATABASE_URL target: ${
    runtimeTarget
      ? `${runtimeTarget.hostname}:${runtimeTarget.port} (${runtimeTarget.pooler ? "pooler" : "direct-or-other"}, pgbouncer=${runtimeTarget.pgbouncer})`
      : "invalid-url"
  }`);
  console.log(`Migration DIRECT_URL target: ${
    migrationTarget
      ? `${migrationTarget.hostname}:${migrationTarget.port}`
      : "missing"
  }`);

  await prisma.$queryRaw`SELECT 1`;

  const vectorRows = await prisma.$queryRaw<Array<{ installed: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM pg_extension
      WHERE extname = 'vector'
    ) AS installed
  `;
  const tableRows = await prisma.$queryRaw<Array<{
    usersTable: string | null;
    sessionsTable: string | null;
    licenseKeysTable: string | null;
    chunksTable: string | null;
  }>>`
    SELECT
      to_regclass('public.users')::text AS "usersTable",
      to_regclass('public.sessions')::text AS "sessionsTable",
      to_regclass('public.license_keys')::text AS "licenseKeysTable",
      to_regclass('public.knowledge_chunks')::text AS "chunksTable"
  `;

  console.log("Database connection: ok");
  console.log(`pgvector extension: ${vectorRows[0]?.installed ? "enabled" : "missing"}`);
  console.log(`users table: ${tableRows[0]?.usersTable ? "exists" : "missing"}`);
  console.log(`sessions table: ${tableRows[0]?.sessionsTable ? "exists" : "missing"}`);
  console.log(`license_keys table: ${tableRows[0]?.licenseKeysTable ? "exists" : "missing"}`);
  console.log(`knowledge_chunks table: ${tableRows[0]?.chunksTable ? "exists" : "missing"}`);

  if (
    !vectorRows[0]?.installed ||
    !tableRows[0]?.usersTable ||
    !tableRows[0]?.sessionsTable ||
    !tableRows[0]?.licenseKeysTable ||
    !tableRows[0]?.chunksTable
  ) {
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "数据库检查失败。";

    console.error(message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
