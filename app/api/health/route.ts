import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasDatabaseUrl, hasUsableOpenAIKey } from "@/lib/server-config";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export interface HealthResponse {
  status: "ok";
  database: boolean;
  openai: boolean;
  supabase: boolean;
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
    supabase: hasSupabaseConfig()
  };

  return NextResponse.json(response);
}
