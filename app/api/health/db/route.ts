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
  error?: {
    name: string;
    code?: string;
    message: string;
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

    return NextResponse.json<DatabaseHealthResponse>({
      ok: true,
      database,
      warnings
    });
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
