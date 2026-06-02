import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasDatabaseUrl, hasSessionSecret, hasUsableOpenAIKey } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface HealthResponse {
  status: "ok";
  database: boolean;
  openai: boolean;
  auth: boolean;
  license: boolean;
}

async function checkDatabase() {
  if (!hasDatabaseUrl()) {
    return false;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const response: HealthResponse = {
    status: "ok",
    database: await checkDatabase(),
    openai: hasUsableOpenAIKey(),
    auth: hasSessionSecret(),
    license: hasSessionSecret()
  };

  return NextResponse.json(response);
}
