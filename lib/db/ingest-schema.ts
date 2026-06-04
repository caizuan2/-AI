import type { PrismaClient } from "@prisma/client";

export interface IngestSchemaColumnRequirement {
  table: string;
  column: string;
  model: string;
}

export interface IngestSchemaCheckResult {
  prismaModelsUsedByIngest: string[];
  requiredTables: string[];
  existingTables: string[];
  missingTables: string[];
  missingColumns: IngestSchemaColumnRequirement[];
  schemaReady: boolean;
}

export const ingestPrismaModelsUsed = [
  "Session",
  "User",
  "UserSettings",
  "KnowledgeItem",
  "KnowledgeChunk",
  "AiCache",
  "KnowledgeQueryLog",
  "RateLimitEvent",
  "AnalyticsEvent"
] as const;

export const ingestTableRequirements = [
  { model: "Session", table: "sessions" },
  { model: "User", table: "users" },
  { model: "UserSettings", table: "user_settings" },
  { model: "KnowledgeItem", table: "knowledge_items" },
  { model: "KnowledgeChunk", table: "knowledge_chunks" },
  { model: "AiCache", table: "ai_cache" },
  { model: "KnowledgeQueryLog", table: "knowledge_query_logs" },
  { model: "RateLimitEvent", table: "rate_limit_events" },
  { model: "AnalyticsEvent", table: "analytics_events" }
] as const;

export const ingestColumnRequirements: IngestSchemaColumnRequirement[] = [
  { model: "Session", table: "sessions", column: "id" },
  { model: "Session", table: "sessions", column: "userId" },
  { model: "Session", table: "sessions", column: "tokenHash" },
  { model: "Session", table: "sessions", column: "expiresAt" },
  { model: "User", table: "users", column: "id" },
  { model: "User", table: "users", column: "email" },
  { model: "User", table: "users", column: "phone" },
  { model: "User", table: "users", column: "name" },
  { model: "User", table: "users", column: "isActive" },
  { model: "User", table: "users", column: "licenseActivated" },
  { model: "UserSettings", table: "user_settings", column: "userId" },
  { model: "UserSettings", table: "user_settings", column: "saveStrategy" },
  { model: "UserSettings", table: "user_settings", column: "defaultExpireDays" },
  { model: "UserSettings", table: "user_settings", column: "preferredProvider" },
  { model: "UserSettings", table: "user_settings", column: "preferredModel" },
  { model: "UserSettings", table: "user_settings", column: "ragTopK" },
  { model: "UserSettings", table: "user_settings", column: "ragMinScore" },
  { model: "UserSettings", table: "user_settings", column: "updatedAt" },
  { model: "KnowledgeItem", table: "knowledge_items", column: "userId" },
  { model: "KnowledgeItem", table: "knowledge_items", column: "category" },
  { model: "KnowledgeChunk", table: "knowledge_chunks", column: "knowledgeItemId" },
  { model: "KnowledgeChunk", table: "knowledge_chunks", column: "chunkText" },
  { model: "KnowledgeChunk", table: "knowledge_chunks", column: "chunkIndex" },
  { model: "KnowledgeChunk", table: "knowledge_chunks", column: "embedding" },
  { model: "KnowledgeChunk", table: "knowledge_chunks", column: "embeddingModel" },
  { model: "AiCache", table: "ai_cache", column: "cacheKey" },
  { model: "AiCache", table: "ai_cache", column: "value" },
  { model: "AiCache", table: "ai_cache", column: "expiresAt" },
  { model: "KnowledgeQueryLog", table: "knowledge_query_logs", column: "query" },
  { model: "KnowledgeQueryLog", table: "knowledge_query_logs", column: "providerUsed" },
  { model: "KnowledgeQueryLog", table: "knowledge_query_logs", column: "modelUsed" },
  { model: "KnowledgeQueryLog", table: "knowledge_query_logs", column: "cached" },
  { model: "RateLimitEvent", table: "rate_limit_events", column: "subject" },
  { model: "RateLimitEvent", table: "rate_limit_events", column: "bucket" },
  { model: "RateLimitEvent", table: "rate_limit_events", column: "resetAt" },
  { model: "AnalyticsEvent", table: "analytics_events", column: "type" },
  { model: "AnalyticsEvent", table: "analytics_events", column: "metadata" }
];

export async function checkIngestSchema(prisma: PrismaClient): Promise<IngestSchemaCheckResult> {
  const requiredTables = ingestTableRequirements.map((item) => item.table);
  const tableRows = await prisma.$queryRaw<Array<{ tableName: string }>>`
    SELECT table_name AS "tableName"
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY(${requiredTables})
    ORDER BY table_name
  `;
  const existingTables = tableRows.map((row) => row.tableName);
  const missingTables = requiredTables.filter((table) => !existingTables.includes(table));
  const existingTableSet = new Set(existingTables);
  const requiredColumns = ingestColumnRequirements
    .filter((requirement) => existingTableSet.has(requirement.table));
  const columnRows = requiredColumns.length > 0
    ? await prisma.$queryRaw<Array<{ tableName: string; columnName: string }>>`
        SELECT table_name AS "tableName", column_name AS "columnName"
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ANY(${requiredColumns.map((item) => item.table)})
        ORDER BY table_name, column_name
      `
    : [];
  const existingColumnKeys = new Set(columnRows.map((row) => `${row.tableName}.${row.columnName}`));
  const missingColumns = ingestColumnRequirements.filter((requirement) => {
    if (!existingTableSet.has(requirement.table)) {
      return false;
    }

    return !existingColumnKeys.has(`${requirement.table}.${requirement.column}`);
  });

  return {
    prismaModelsUsedByIngest: [...ingestPrismaModelsUsed],
    requiredTables,
    existingTables,
    missingTables,
    missingColumns,
    schemaReady: missingTables.length === 0 && missingColumns.length === 0
  };
}
