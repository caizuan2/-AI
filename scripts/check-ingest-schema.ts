import { PrismaClient } from "@prisma/client";
import { checkIngestSchema } from "@/lib/db/ingest-schema";
import { getDatabaseUrlWithPoolerParams, getSafeDatabaseUrlInfo } from "@/lib/safe-db-url";

function printJson(label: string, value: unknown) {
  console.log(`${label}: ${JSON.stringify(value, null, 2)}`);
}

async function main() {
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

  console.log("AI Knowledge Base /ingest schema check");
  printJson("DATABASE_URL target", getSafeDatabaseUrlInfo());

  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("DB_CONNECTION_OK");

    const allTables = await prisma.$queryRaw<Array<{ tableName: string }>>`
      SELECT table_name AS "tableName"
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    const schema = await checkIngestSchema(prisma);

    printJson("existingTables", allTables.map((row) => row.tableName));
    printJson("prismaModelsUsedByIngest", schema.prismaModelsUsedByIngest);
    printJson("requiredTables", schema.requiredTables);
    printJson("missingTables", schema.missingTables);
    printJson("missingColumns", schema.missingColumns);
    console.log(`SCHEMA_READY: ${schema.schemaReady ? "true" : "false"}`);

    if (!schema.schemaReady) {
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
          message: "检查 /ingest 表结构失败。"
        };

    printJson("INGEST_SCHEMA_CHECK_ERROR", details);
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
