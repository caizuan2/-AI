import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getProviderReadiness } from "@/lib/ai/providers";
import { checkIngestSchema, type IngestSchemaCheckResult } from "@/lib/db/ingest-schema";
import { getRequestIdFromHeaders, logger, toSafeErrorLog } from "@/lib/logger";
import { getSafeDatabaseUrlInfo } from "@/lib/safe-db-url";
import {
  getDeepSeekModel,
  getEmbeddingModel,
  getOpenAIModel,
  hasDatabaseUrl,
  hasLicenseSecret,
  hasSessionSecret,
  hasUsableDeepSeekKey,
  hasUsableOpenAIKey
} from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HealthStatus = "ok" | "degraded";

type DatabaseCheck = {
  checked: boolean;
  connected: boolean;
  error?: string;
  message?: string;
  target: ReturnType<typeof getSafeDatabaseUrlInfo>;
};

type SchemaCheck = {
  checked: boolean;
  ready: boolean;
  requiredTables: string[];
  existingTables: string[];
  missingTables: string[];
  missingColumns: IngestSchemaCheckResult["missingColumns"];
  prismaModels: string[];
  error?: string;
  message?: string;
};

type AiCheck = {
  checked: boolean;
  provider: string;
  fallbackProvider: string | null;
  model: string;
  embeddingModel: string;
  openaiConfigured: boolean;
  deepseekConfigured: boolean;
  missingEnv: string[];
  deepseek?: {
    checked: boolean;
    configured: boolean;
    baseUrlConfigured: boolean;
    modelConfigured: boolean;
    missingEnv: string[];
  };
};

type VectorCheck = {
  checked: boolean;
  ready: boolean;
  pgvectorEnabled: boolean;
  embeddingColumnExists: boolean;
  matchFunctionExists: boolean;
  embeddingDimension: number;
  error?: string;
  message?: string;
};

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
    database?: DatabaseCheck;
    schema?: SchemaCheck;
    ai?: AiCheck;
    vector?: VectorCheck;
  };
}

function parseBooleanParam(value: string | null) {
  return value === "true" || value === "1" || value === "yes";
}

function hasEnv(name: string) {
  return Boolean(process.env[name]?.trim());
}

function getMissingDeepSeekEnv() {
  const missingEnv: string[] = [];

  if (!hasEnv("DEEPSEEK_API_KEY")) {
    missingEnv.push("DEEPSEEK_API_KEY");
  }

  if (!hasEnv("DEEPSEEK_BASE_URL")) {
    missingEnv.push("DEEPSEEK_BASE_URL");
  }

  if (!hasEnv("DEEPSEEK_MODEL")) {
    missingEnv.push("DEEPSEEK_MODEL");
  }

  return missingEnv;
}

function getAiCheck(shouldCheckDeepSeek: boolean): AiCheck {
  const readiness = getProviderReadiness();
  const missingEnv: string[] = [];

  if (!hasEnv("OPENAI_API_KEY")) {
    missingEnv.push("OPENAI_API_KEY");
  }

  if (!hasEnv("OPENAI_EMBEDDING_MODEL")) {
    missingEnv.push("OPENAI_EMBEDDING_MODEL");
  }

  const deepseekMissingEnv = shouldCheckDeepSeek ? getMissingDeepSeekEnv() : [];

  missingEnv.push(...deepseekMissingEnv);

  return {
    checked: true,
    provider: readiness.primaryProvider,
    fallbackProvider: readiness.fallbackProvider,
    model: readiness.primaryProvider === "deepseek" ? getDeepSeekModel() : getOpenAIModel(),
    embeddingModel: getEmbeddingModel(),
    openaiConfigured: hasUsableOpenAIKey(),
    deepseekConfigured: shouldCheckDeepSeek ? deepseekMissingEnv.length === 0 && hasUsableDeepSeekKey() : hasUsableDeepSeekKey(),
    missingEnv,
    ...(shouldCheckDeepSeek
      ? {
          deepseek: {
            checked: true,
            configured: deepseekMissingEnv.length === 0 && hasUsableDeepSeekKey(),
            baseUrlConfigured: hasEnv("DEEPSEEK_BASE_URL"),
            modelConfigured: hasEnv("DEEPSEEK_MODEL"),
            missingEnv: deepseekMissingEnv
          }
        }
      : {})
  };
}

async function getDatabaseCheck(requestId: string): Promise<DatabaseCheck> {
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

async function getSchemaCheck(requestId: string): Promise<SchemaCheck> {
  try {
    const schema = await checkIngestSchema(prisma);

    return {
      checked: true,
      ready: schema.schemaReady,
      requiredTables: schema.requiredTables,
      existingTables: schema.existingTables,
      missingTables: schema.missingTables,
      missingColumns: schema.missingColumns,
      prismaModels: schema.prismaModelsUsedByIngest
    };
  } catch (error) {
    logger.error("health.schema_failed", {
      requestId,
      error: toSafeErrorLog(error)
    });

    return {
      checked: true,
      ready: false,
      requiredTables: [],
      existingTables: [],
      missingTables: [],
      missingColumns: [],
      prismaModels: [],
      error: "DATABASE_SCHEMA_MISSING",
      message: "数据库表结构检查失败。"
    };
  }
}

async function getVectorCheck(requestId: string): Promise<VectorCheck> {
  try {
    const rows = await prisma.$queryRaw<Array<{
      pgvectorEnabled: boolean;
      embeddingColumnExists: boolean;
      matchFunctionExists: boolean;
    }>>`
      SELECT
        EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector') AS "pgvectorEnabled",
        EXISTS(
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'knowledge_chunks'
            AND column_name = 'embedding'
        ) AS "embeddingColumnExists",
        EXISTS(
          SELECT 1
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.proname = 'match_knowledge_chunks'
        ) AS "matchFunctionExists"
    `;
    const first = rows[0];
    const pgvectorEnabled = Boolean(first?.pgvectorEnabled);
    const embeddingColumnExists = Boolean(first?.embeddingColumnExists);
    const matchFunctionExists = Boolean(first?.matchFunctionExists);

    return {
      checked: true,
      ready: pgvectorEnabled && embeddingColumnExists && matchFunctionExists,
      pgvectorEnabled,
      embeddingColumnExists,
      matchFunctionExists,
      embeddingDimension: 1536
    };
  } catch (error) {
    logger.error("health.vector_failed", {
      requestId,
      error: toSafeErrorLog(error)
    });

    return {
      checked: true,
      ready: false,
      pgvectorEnabled: false,
      embeddingColumnExists: false,
      matchFunctionExists: false,
      embeddingDimension: 1536,
      error: "VECTOR_SEARCH_FAILED",
      message: "pgvector 检查失败。"
    };
  }
}

export async function GET(request: Request) {
  const requestId = getRequestIdFromHeaders(request.headers);
  const url = new URL(request.url);
  const shouldCheckDatabase = parseBooleanParam(url.searchParams.get("database"));
  const shouldCheckSchema = parseBooleanParam(url.searchParams.get("schema"));
  const shouldCheckAi = parseBooleanParam(url.searchParams.get("ai")) || parseBooleanParam(url.searchParams.get("deepseek"));
  const shouldCheckDeepSeek = parseBooleanParam(url.searchParams.get("deepseek"));
  const shouldCheckVector = parseBooleanParam(url.searchParams.get("vector"));
  const hasExplicitChecks = shouldCheckDatabase || shouldCheckSchema || shouldCheckAi || shouldCheckVector;
  const checks: HealthResponse["checks"] = {};

  if (!hasExplicitChecks || shouldCheckDatabase || shouldCheckSchema || shouldCheckVector) {
    checks.database = await getDatabaseCheck(requestId);
  }

  if (shouldCheckSchema) {
    checks.schema = checks.database?.connected
      ? await getSchemaCheck(requestId)
      : {
          checked: true,
          ready: false,
          requiredTables: [],
          existingTables: [],
          missingTables: [],
          missingColumns: [],
          prismaModels: [],
          error: "DATABASE_CONNECTION_FAILED",
          message: "数据库未连接，无法检查 schema。"
        };
  }

  if (!hasExplicitChecks || shouldCheckAi) {
    checks.ai = getAiCheck(shouldCheckDeepSeek);
  }

  if (shouldCheckVector) {
    checks.vector = checks.database?.connected
      ? await getVectorCheck(requestId)
      : {
          checked: true,
          ready: false,
          pgvectorEnabled: false,
          embeddingColumnExists: false,
          matchFunctionExists: false,
          embeddingDimension: 1536,
          error: "DATABASE_CONNECTION_FAILED",
          message: "数据库未连接，无法检查 pgvector。"
        };
  }

  const databaseReady = checks.database ? checks.database.connected : hasDatabaseUrl();
  const schemaReady = checks.schema ? checks.schema.ready : true;
  const aiReady = checks.ai ? checks.ai.openaiConfigured : hasUsableOpenAIKey();
  const deepseekReady = shouldCheckDeepSeek && checks.ai ? checks.ai.deepseekConfigured : true;
  const vectorReady = checks.vector ? checks.vector.ready : true;
  const auth = hasSessionSecret();
  const license = hasLicenseSecret();
  const ok = databaseReady && schemaReady && aiReady && deepseekReady && vectorReady && auth && license;
  const response: HealthResponse = {
    ok,
    status: ok ? "ok" : "degraded",
    requestId,
    database: databaseReady,
    openai: checks.ai ? checks.ai.openaiConfigured : hasUsableOpenAIKey(),
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
