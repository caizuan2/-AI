import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRequestIdFromHeaders, logger, toSafeErrorLog } from "@/lib/logger";
import { getSafeDatabaseUrlInfo } from "@/lib/safe-db-url";
import {
  hasDatabaseUrl,
  hasLicenseSecret,
  hasSessionSecret,
  hasUsableOpenAIKey
} from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HealthStatus = "ok" | "degraded";

interface HealthResponse {
  ok: boolean;
  status: HealthStatus;
  requestId: string;
  database: boolean;
  openai: boolean;
  auth: boolean;
  license: boolean;
  supabase: boolean;
  checks: {
    database?: {
      checked: boolean;
      connected: boolean;
      error?: string;
      message?: string;
      target: ReturnType<typeof getSafeDatabaseUrlInfo>;
    };
    ai?: {
      checked: boolean;
      provider: "openai";
      aiConfigured: boolean;
      missingEnv: string[];
      model: string;
      embeddingModel: string;
    };
  };
}

function parseBooleanParam(value: string | null) {
  return value === "true" || value === "1" || value === "yes";
}

function getAiCheck() {
  const missingEnv: string[] = [];

  if (!process.env.OPENAI_API_KEY?.trim()) {
    missingEnv.push("OPENAI_API_KEY");
  }

  return {
    checked: true,
    provider: "openai" as const,
    aiConfigured: hasUsableOpenAIKey(),
    missingEnv,
    model: process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini",
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small"
  };
}

async function getDatabaseCheck(requestId: string) {
  const target = getSafeDatabaseUrlInfo();

  if (!hasDatabaseUrl()) {
    return {
      checked: true,
      connected: false,
      error: target.present ? "INVALID_DATABASE_URL" : "MISSING_DATABASE_URL",
      message: target.present ? "DATABASE_URL 配置无效。" : "DATABASE_URL 未配置。",
      target
    };
  }

  try {
    await prisma.$queryRaw`SELECT 1`;

    return {
      checked: true,
      connected: true,
      target
    };
  } catch (error) {
    logger.error("health.database_failed", {
      requestId,
      database: target,
      error: toSafeErrorLog(error)
    });

    return {
      checked: true,
      connected: false,
      error: "DATABASE_CONNECTION_FAILED",
      message: "数据库连接失败。",
      target
    };
  }
}

export async function GET(request: Request) {
  const requestId = getRequestIdFromHeaders(request.headers);
  const url = new URL(request.url);
  const hasExplicitChecks = url.searchParams.has("database") || url.searchParams.has("ai");
  const shouldCheckDatabase = !hasExplicitChecks || parseBooleanParam(url.searchParams.get("database"));
  const shouldCheckAi = !hasExplicitChecks || parseBooleanParam(url.searchParams.get("ai"));
  const checks: HealthResponse["checks"] = {};

  if (shouldCheckDatabase) {
    checks.database = await getDatabaseCheck(requestId);
  }

  if (shouldCheckAi) {
    checks.ai = getAiCheck();
  }

  const database = checks.database ? checks.database.connected : hasDatabaseUrl();
  const openai = checks.ai ? checks.ai.aiConfigured : hasUsableOpenAIKey();
  const auth = hasSessionSecret();
  const license = hasLicenseSecret();
  const response: HealthResponse = {
    ok: database && openai && auth && license,
    status: database && openai && auth && license ? "ok" : "degraded",
    requestId,
    database,
    openai,
    auth,
    license,
    supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()),
    checks
  };

  return NextResponse.json(response, {
    headers: {
      "x-request-id": requestId
    }
  });
}
