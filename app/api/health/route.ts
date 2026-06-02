import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasDatabaseUrl } from "@/lib/server-config";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export interface HealthResponse {
  auth: boolean;
  database: boolean;
  status: "ok";
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
    auth: hasSupabaseConfig(),
    database: await checkDatabase(),
    status: "ok"
  };

  return NextResponse.json(response);
}
