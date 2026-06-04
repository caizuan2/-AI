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
  getQwenBaseUrl,
  getQwenModel,
  hasDatabaseUrl,
  hasLicenseSecret,
  hasSessionSecret,
  hasUsableDeepSeekKey,
  hasUsableOpenAIKey,
  hasUsableQwenKey
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
  secondaryFallbackProvider?: string | null;
  providerChain?: string[];
  model: string;
  embeddingModel: string;
  openaiConfigured: boolean;
  qwenConfigured: boolean;
  deepseekConfigured: boolean;
  missingEnv: string[];
};

type ProviderConfigCheck = {
  checked: boolean;
  configured: boolean;
  model: string;
  baseUrlHost: string | null;
  missingEnv: string[];
};

type EmbeddingCheck = {
  checked: boolean;
  provider: "openai";
  model: string;
  configured: boolean;
  missingEnv: string[];
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
    qwen?: ProviderConfigCheck;
    openai?: ProviderConfigCheck;
    deepseek?: ProviderConfigCheck;
    embedding?: EmbeddingCheck;
    vector?: VectorCheck;
  };
}

function parseBooleanParam(value: string | null) {
  return value === "true" || value === "1" || value === "yes";
}

function hasEnv(name: string) {
  return Boolean(process.env[name]?.trim());
}

function getBaseUrlHost(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

function getMissingQwenEnv() {
  const missingEnv: string[] = [];

  if (!hasEnv("QWEN_API_KEY")) {
    missingEnv.push("QWEN_API_KEY");
  }

  if (!hasEnv("QWEN_BASE_URL")) {
    missingEnv.push("QWEN_BASE_URL");
  }

  if (!hasEnv("QWEN_MODEL")) {
    missingEnv.push("QWEN_MODEL");
  }

  return missingEnv;
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

function getMissingOpenAIEnv() {
  const missingEnv: string[] = [];

  if (!hasEnv("OPENAI_API_KEY")) {
    missingEnv.push("OPENAI_API_KEY");
  }

  if (!hasEnv("OPENAI_BASE_URL")) {
    missingEnv.push("OPENAI_BASE_URL");
  }

  if (!hasEnv("OPENAI_MODEL")) {
    missingEnv.push("OPENAI_MODEL");
  }

  return missingEnv;
}

function getEmbeddingCheck(): EmbeddingCheck {
  const missingEnv = [];

  if (!hasEnv("OPENAI_API_KEY")) {
    missingEnv.push("OPENAI_API_KEY");
  }

  if (!hasEnv("OPENAI_EMBEDDING_MODEL")) {
    missingEnv.push("OPENAI_EMBEDDING_MODEL");
  }

  return {
    checked: true,
    provider: "openai",
    model: getEmbeddingModel(),
    configured: missingEnv.length === 0 && hasUsableOpenAIKey(),
    missingEnv
  };
}

function getQwenCheck(): ProviderConfigCheck {
  const missingEnv = getMissingQwenEnv();

  return {
    checked: true,
    configured: missingEnv.length === 0 && hasUsableQwenKey(),
    model: getQwenModel(),
    baseUrlHost: getBaseUrlHost(getQwenBaseUrl()),
    missingEnv
  };
}

function getOpenAICheck(): ProviderConfigCheck {
  const missingEnv = getMissingOpenAIEnv();

  return {
    checked: true,
    configured: missingEnv.length === 0 && hasUsableOpenAIKey(),
    model: getOpenAIModel(),
    baseUrlHost: getBaseUrlHost(process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1"),
    missingEnv
  };
}

function getDeepSeekCheck(): ProviderConfigCheck {
  const missingEnv = getMissingDeepSeekEnv();

  return {
    checked: true,
    configured: missingEnv.length === 0 && hasUsableDeepSeekKey(),
    model: getDeepSeekModel(),
    baseUrlHost: getBaseUrlHost(process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com"),
    missingEnv
  };
}

function getAiCheck(input: {
  shouldCheckQwen: boolean;
  shouldCheckDeepSeek: boolean;
}): AiCheck {
  const readiness = getProviderReadiness();
  const missingEnv: string[] = [];

  if (readiness.primaryProvider === "qwen" && !hasUsableQwenKey()) {
    missingEnv.push("QWEN_API_KEY");
  }

  if (!hasUsableOpenAIKey()) {
    missingEnv.push("OPENAI_API_KEY");
  }

  if (!hasEnv("OPENAI_EMBEDDING_MODEL")) {
    missingEnv.push("OPENAI_EMBEDDING_MODEL");
  }

  if (input.shouldCheckQwen) {
    missingEnv.push(...getMissingQwenEnv());
  }

  if (input.shouldCheckDeepSeek) {
    missingEnv.push(...getMissingDeepSeekEnv());
  }

  return {
    checked: true,
    provider: readiness.primaryProvider,
    fallbackProvider: readiness.fallbackProvider,
    secondaryFallbackProvider: readiness.secondaryFallbackProvider,
    providerChain: readiness.providerChain,
    model: readiness.primaryProvider === "qwen"
      ? getQwenModel()
      : readiness.primaryProvider === "deepseek"
        ? getDeepSeekModel()
        : getOpenAIModel(),
    embeddingModel: getEmbeddingModel(),
    openaiConfigured: hasUsableOpenAIKey(),
    qwenConfigured: hasUsableQwenKey(),
    deepseekConfigured: hasUsableDeepSeekKey(),
    missingEnv: Array.from(new Set(missingEnv))
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
  const shouldCheckQwen = parseBooleanParam(url.searchParams.get("qwen"));
  const shouldCheckDeepSeek = parseBooleanParam(url.searchParams.get("deepseek"));
  const shouldCheckAi = parseBooleanParam(url.searchParams.get("ai")) || shouldCheckQwen || shouldCheckDeepSeek;
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
    checks.ai = getAiCheck({ shouldCheckQwen, shouldCheckDeepSeek });
    checks.embedding = getEmbeddingCheck();
    checks.openai = getOpenAICheck();

    if (shouldCheckQwen || !hasExplicitChecks) {
      checks.qwen = getQwenCheck();
    }

    if (shouldCheckDeepSeek || !hasExplicitChecks) {
      checks.deepseek = getDeepSeekCheck();
    }
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
  const qwenReady = shouldCheckQwen ? Boolean(checks.qwen?.configured) : true;
  const deepseekReady = shouldCheckDeepSeek && checks.ai ? checks.ai.deepseekConfigured : true;
  const embeddingReady = checks.embedding ? checks.embedding.configured : true;
  const vectorReady = checks.vector ? checks.vector.ready : true;
  const auth = hasSessionSecret();
  const license = hasLicenseSecret();
  const ok = databaseReady && schemaReady && aiReady && qwenReady && deepseekReady && embeddingReady && vectorReady && auth && license;
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
