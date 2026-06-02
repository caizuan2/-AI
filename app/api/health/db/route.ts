import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasDatabaseUrl } from "@/lib/server-config";

export const dynamic = "force-dynamic";

export interface DatabaseHealthResponse {
  database: boolean;
  error?: string;
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
  } catch {
    return NextResponse.json<DatabaseHealthResponse>({
      database: false,
      error: "数据库连接失败。"
    });
  }
}
