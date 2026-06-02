import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasDatabaseUrl } from "@/lib/server-config";

export const dynamic = "force-dynamic";

export interface DatabaseHealthResponse {
  database: boolean;
  error?: string;
  stack?: string;
}

function serializeDatabaseError(error: unknown) {
  if (error instanceof Error) {
    return {
      error: error.message,
      stack: error.stack
    };
  }

  return {
    error: String(error)
  };
}

export async function GET() {
  if (!hasDatabaseUrl()) {
    return NextResponse.json<DatabaseHealthResponse>({
      database: false,
      error: "DATABASE_URL 未配置。"
    });
  }

  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json<DatabaseHealthResponse>({
      database: true
    });
  } catch (error) {
    const debugError = serializeDatabaseError(error);

    console.error("[api/health/db] database check failed", debugError);

    return NextResponse.json<DatabaseHealthResponse>({
      database: false,
      ...debugError
    });
  }
}
