import { PrismaClient } from "@prisma/client";
import { getDatabasePoolerWarnings, getDatabaseUrlWithPoolerParams, getSafeDatabaseUrlInfo } from "@/lib/safe-db-url";
import { hasUsableOpenAIKey } from "@/lib/server-config-core";

const requiredRuntimeEnv = [
  "DATABASE_URL",
  "DIRECT_URL",
  "SESSION_SECRET",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "OPENAI_EMBEDDING_MODEL"
];

function printJson(label: string, value: unknown) {
  console.log(`${label}: ${JSON.stringify(value, null, 2)}`);
}

function getMissingEnv() {
  return requiredRuntimeEnv.filter((name) => !process.env[name]?.trim());
}

async function main() {
  const databaseUrlInfo = getSafeDatabaseUrlInfo();
  const directUrlInfo = getSafeDatabaseUrlInfo(process.env.DIRECT_URL?.trim() || "");
  const missingEnv = getMissingEnv();
  const aiEnvOk = hasUsableOpenAIKey();
  const warnings = getDatabasePoolerWarnings(databaseUrlInfo);

  console.log("AI Knowledge Base ingest health check");
  printJson("DATABASE_URL target", databaseUrlInfo);
  printJson("DIRECT_URL target", directUrlInfo);
  printJson("DATABASE_URL warnings", warnings);
  printJson("Missing env", missingEnv);
  console.log(`AI_ENV_OK: ${aiEnvOk ? "true" : "false"}`);

  if (!process.env.DATABASE_URL?.trim()) {
    console.log("MISSING_ENV: DATABASE_URL");
    process.exitCode = 1;
    return;
  }

  const runtimeDatabaseUrl = getDatabaseUrlWithPoolerParams();
  const prisma = new PrismaClient({
    datasources: runtimeDatabaseUrl
      ? {
          db: {
            url: runtimeDatabaseUrl
          }
        }
      : undefined,
    log: ["error"]
  });

  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("DB_OK");

    const tableRows = await prisma.$queryRaw<Array<{
      usersTable: string | null;
      sessionsTable: string | null;
      knowledgeItemsTable: string | null;
      knowledgeChunksTable: string | null;
      userSettingsTable: string | null;
      analyticsEventsTable: string | null;
    }>>`
      SELECT
        to_regclass('public.users')::text AS "usersTable",
        to_regclass('public.sessions')::text AS "sessionsTable",
        to_regclass('public.knowledge_items')::text AS "knowledgeItemsTable",
        to_regclass('public.knowledge_chunks')::text AS "knowledgeChunksTable",
        to_regclass('public.user_settings')::text AS "userSettingsTable",
        to_regclass('public.analytics_events')::text AS "analyticsEventsTable"
    `;
    const tables = tableRows[0];
    const missingTables = Object.entries(tables ?? {})
      .filter(([, value]) => !value)
      .map(([name]) => name);

    printJson("Schema tables", tables);

    if (missingTables.length > 0) {
      printJson("SCHEMA_ERROR", missingTables);
      process.exitCode = 1;
    }
  } catch (error) {
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

    printJson("DB_ERROR", details);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  printJson("UNKNOWN_ERROR", error instanceof Error
    ? { name: error.name, message: error.message }
    : { name: "UnknownError" });
  process.exitCode = 1;
});
