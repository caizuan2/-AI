import { PrismaClient } from "@prisma/client";
import { getDatabasePoolerWarnings, getSafeDatabaseUrlInfo } from "@/lib/safe-db-url";
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

async function main() {
  const runtimeTarget = getSafeDatabaseUrlInfo(databaseUrl);
  const migrationTarget = directUrl ? getSafeDatabaseUrlInfo(directUrl) : { present: false };
  const warnings = getDatabasePoolerWarnings(runtimeTarget);

  console.log(`Using database env: ${databaseUrlEnvName ?? "DATABASE_URL"}`);
  console.log("Runtime DATABASE_URL target:", runtimeTarget);
  console.log("Migration DIRECT_URL target:", migrationTarget);

  if (warnings.length > 0) {
    console.warn("DATABASE_URL warnings:", warnings);
  }

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
    const details = error instanceof Error
      ? {
          name: error.name,
          code: typeof (error as Error & { code?: unknown }).code === "string"
            ? (error as Error & { code?: string }).code
            : undefined,
          message: error.message
        }
      : {
          name: "UnknownError",
          message: "数据库检查失败。"
        };

    console.error("Database check failed:", details);

    if (details.code === "P1000") {
      console.error("P1000: 数据库认证失败，请检查用户名和密码。");
    }

    if (details.code === "P1001") {
      console.error("P1001: 数据库不可达，请检查 host、port 和 Supabase Pooler URL。");
    }

    if (details.code === "P2024") {
      console.error("P2024: 连接池超时，请检查 connection_limit 和 pool_timeout。");
    }

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
