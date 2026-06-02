import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasDatabaseUrl, hasSessionSecret, hasUsableOpenAIKey } from "@/lib/server-config";

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
    const rows = await prisma.$queryRaw<Array<{
      users: string | null;
      sessions: string | null;
      licenseKeys: string | null;
    }>>`
      SELECT
        to_regclass('public.users')::text AS "users",
        to_regclass('public.sessions')::text AS "sessions",
        to_regclass('public.license_keys')::text AS "licenseKeys"
    `;
    const schema = rows[0];

    return Boolean(schema?.users && schema.sessions && schema.licenseKeys);
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
