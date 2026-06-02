import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getDatabasePoolerWarnings, getSafeDatabaseUrlInfo, type SafeDatabaseUrlInfo } from "@/lib/safe-db-url";
import { hasDatabaseUrl } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface DatabaseHealthResponse {
  ok: boolean;
  database: SafeDatabaseUrlInfo;
  warnings?: string[];
  schema?: {
    ready: boolean;
    requiredTables: string[];
    missingTables: string[];
    missingColumns: Array<{
      table: string;
      column: string;
    }>;
    licenseKeyStatusEnum: boolean;
  };
  error?: {
    name: string;
    code?: string;
    message: string;
  };
}

const requiredSchema: Record<string, string[]> = {
  users: [
    "id",
    "phone",
    "passwordHash",
    "name",
    "isActive",
    "licenseActivated",
    "createdAt",
    "updatedAt"
  ],
  sessions: ["id", "userId", "tokenHash", "expiresAt", "createdAt"],
  license_keys: ["id", "keyHash", "status", "redeemedByUserId", "redeemedAt", "expiresAt", "createdAt"]
};

async function checkRequiredSchema() {
  const requiredTables = Object.keys(requiredSchema);
  const tableRows = await prisma.$queryRaw<Array<{ tableName: string }>>`
    SELECT table_name AS "tableName"
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('users', 'sessions', 'license_keys')
  `;
  const existingTables = new Set(tableRows.map((row) => row.tableName));
  const missingTables = requiredTables.filter((table) => !existingTables.has(table));

  const columnRows = await prisma.$queryRaw<Array<{ tableName: string; columnName: string }>>`
    SELECT table_name AS "tableName", column_name AS "columnName"
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('users', 'sessions', 'license_keys')
  `;
  const existingColumns = new Set(columnRows.map((row) => `${row.tableName}.${row.columnName}`));
  const missingColumns = Object.entries(requiredSchema).flatMap(([table, columns]) =>
    columns
      .filter((column) => existingTables.has(table) && !existingColumns.has(`${table}.${column}`))
      .map((column) => ({ table, column }))
  );
  const enumRows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM pg_type
      WHERE typname = 'LicenseKeyStatus'
    ) AS "exists"
  `;
  const licenseKeyStatusEnum = Boolean(enumRows[0]?.exists);
  const ready = missingTables.length === 0 && missingColumns.length === 0 && licenseKeyStatusEnum;

  return {
    ready,
    requiredTables,
    missingTables,
    missingColumns,
    licenseKeyStatusEnum
  };
}

function serializeDatabaseError(error: unknown) {
  if (error instanceof Error) {
    const details = error as Error & {
      code?: unknown;
    };

    return {
      name: error.name,
      code: typeof details.code === "string" ? details.code : undefined,
      message: error.message
    };
  }

  return {
    name: "UnknownError",
    message: String(error)
  };
}

export async function GET() {
  const database = getSafeDatabaseUrlInfo();
  const warnings = getDatabasePoolerWarnings(database);

  if (!hasDatabaseUrl()) {
    return NextResponse.json<DatabaseHealthResponse>({
      ok: false,
      database,
      warnings,
      error: {
        name: "DatabaseConfigError",
        message: "DATABASE_URL 未配置。"
      }
    }, { status: 500 });
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    const schema = await checkRequiredSchema();

    return NextResponse.json<DatabaseHealthResponse>({
      ok: schema.ready,
      database,
      warnings,
      schema,
      ...(schema.ready
        ? {}
        : {
            error: {
              name: "DatabaseSchemaNotReady",
              message: "数据库连接正常，但生产库尚未应用完整 Prisma migrations。"
            }
          })
    }, { status: schema.ready ? 200 : 500 });
  } catch (error) {
    const safeError = serializeDatabaseError(error);

    logger.error("health.db.failed", {
      route: "/api/health/db",
      database,
      error: safeError
    });
    console.error("[api/health/db] database check failed", {
      database,
      error: safeError
    });

    return NextResponse.json<DatabaseHealthResponse>({
      ok: false,
      database,
      warnings,
      error: safeError
    }, { status: 500 });
  }
}
