import { prisma } from "@/lib/prisma";
import { requireAdminUser } from "@/lib/admin";
import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { hasDatabaseUrl } from "@/lib/server-config";

export const dynamic = "force-dynamic";

type DailyCountRow = {
  day: Date | string;
  count: bigint | number | string;
};

type DailyAverageRow = {
  day: Date | string;
  average: number | string | null;
  count: bigint | number | string;
};

type DailyAiCostRow = {
  day: Date | string;
  callCount: bigint | number | string;
  estimatedCostUsd: number | string | null;
  totalTokens: bigint | number | string | null;
};

type RetentionRow = {
  previousActiveUsers: bigint | number | string;
  currentActiveUsers: bigint | number | string;
  retainedUsers: bigint | number | string;
};

interface AdminAnalyticsResponse {
  range: {
    days: number;
    startDate: string;
    endDate: string;
  };
  summary: {
    dailyActiveUsersToday: number;
    newKnowledgeTotal: number;
    questionTotal: number;
    averageRetrievalHitCount: number | null;
    aiCallTotal: number;
    aiEstimatedCostUsd: number;
    aiTotalTokens: number;
    uploadFileTotal: number;
    retentionRate: number | null;
  };
  retention: {
    previousActiveUsers: number;
    currentActiveUsers: number;
    retainedUsers: number;
    rate: number | null;
  };
  series: Array<{
    date: string;
    dailyActiveUsers: number;
    newKnowledgeCount: number;
    questionCount: number;
    averageRetrievalHitCount: number | null;
    aiCallCount: number;
    aiEstimatedCostUsd: number;
    aiTotalTokens: number;
    uploadFileCount: number;
  }>;
  empty: boolean;
}

const DEFAULT_DAYS = 14;
const MAX_DAYS = 30;

function parseDays(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = Number(searchParams.get("days") ?? DEFAULT_DAYS);

  return Number.isInteger(days) && days > 0 ? Math.min(days, MAX_DAYS) : DEFAULT_DAYS;
}

function startOfToday() {
  const date = new Date();

  date.setHours(0, 0, 0, 0);

  return date;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);

  next.setDate(next.getDate() + days);

  return next;
}

function toDateKey(value: Date | string) {
  return new Date(value).toISOString().slice(0, 10);
}

function toNumber(value: bigint | number | string | null | undefined) {
  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number, precision = 2) {
  const scale = 10 ** precision;

  return Math.round(value * scale) / scale;
}

function buildBaseSeries(startDate: Date, days: number): AdminAnalyticsResponse["series"] {
  return Array.from({ length: days }, (_, index) => ({
    date: toDateKey(addDays(startDate, index)),
    dailyActiveUsers: 0,
    newKnowledgeCount: 0,
    questionCount: 0,
    averageRetrievalHitCount: null,
    aiCallCount: 0,
    aiEstimatedCostUsd: 0,
    aiTotalTokens: 0,
    uploadFileCount: 0
  }));
}

function indexSeries(series: AdminAnalyticsResponse["series"]) {
  return new Map(series.map((item) => [item.date, item]));
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

async function getDailyActiveRows(startDate: Date) {
  return prisma.$queryRaw<DailyCountRow[]>`
    WITH active AS (
      SELECT "userId", date_trunc('day', "occurredAt")::date AS day
      FROM "analytics_events"
      WHERE "userId" IS NOT NULL AND "occurredAt" >= ${startDate}

      UNION

      SELECT "userId", date_trunc('day', "createdAt")::date AS day
      FROM "knowledge_items"
      WHERE "createdAt" >= ${startDate}

      UNION

      SELECT "userId", date_trunc('day', "createdAt")::date AS day
      FROM "conversations"
      WHERE "createdAt" >= ${startDate}

      UNION

      SELECT "userId", date_trunc('day', "createdAt")::date AS day
      FROM "feedback"
      WHERE "createdAt" >= ${startDate}
    )
    SELECT day, COUNT(DISTINCT "userId") AS count
    FROM active
    GROUP BY day
    ORDER BY day ASC
  `;
}

async function getDailyKnowledgeRows(startDate: Date) {
  return prisma.$queryRaw<DailyCountRow[]>`
    SELECT date_trunc('day', "createdAt")::date AS day, COUNT(*) AS count
    FROM "knowledge_items"
    WHERE "createdAt" >= ${startDate}
    GROUP BY day
    ORDER BY day ASC
  `;
}

async function getDailyQuestionRows(startDate: Date) {
  return prisma.$queryRaw<DailyCountRow[]>`
    WITH questions AS (
      SELECT "occurredAt" AS "askedAt"
      FROM "analytics_events"
      WHERE "type" = 'CHAT_QUESTION' AND "occurredAt" >= ${startDate}

      UNION ALL

      SELECT m."createdAt" AS "askedAt"
      FROM "messages" m
      INNER JOIN "conversations" c ON c."id" = m."conversationId"
      WHERE c."type" = 'CHAT'
        AND m."role" = 'USER'
        AND m."createdAt" >= ${startDate}
    )
    SELECT date_trunc('day', "askedAt")::date AS day, COUNT(*) AS count
    FROM questions
    GROUP BY day
    ORDER BY day ASC
  `;
}

async function getDailyRetrievalRows(startDate: Date) {
  return prisma.$queryRaw<DailyAverageRow[]>`
    SELECT
      date_trunc('day', "occurredAt")::date AS day,
      AVG("numericValue") AS average,
      COUNT(*) AS count
    FROM "analytics_events"
    WHERE "type" = 'RAG_RETRIEVAL'
      AND "numericValue" IS NOT NULL
      AND "occurredAt" >= ${startDate}
    GROUP BY day
    ORDER BY day ASC
  `;
}

async function getDailyAiCostRows(startDate: Date) {
  return prisma.$queryRaw<DailyAiCostRow[]>`
    SELECT
      date_trunc('day', "occurredAt")::date AS day,
      COUNT(*) AS "callCount",
      COALESCE(SUM("numericValue"), 0) AS "estimatedCostUsd",
      COALESCE(SUM(COALESCE(("metadata"->>'totalTokens')::integer, 0)), 0) AS "totalTokens"
    FROM "analytics_events"
    WHERE "type" = 'AI_CALL'
      AND "occurredAt" >= ${startDate}
    GROUP BY day
    ORDER BY day ASC
  `;
}

async function getDailyUploadRows(startDate: Date) {
  return prisma.$queryRaw<DailyCountRow[]>`
    SELECT date_trunc('day', "occurredAt")::date AS day, COUNT(*) AS count
    FROM "analytics_events"
    WHERE "type" = 'FILE_UPLOAD'
      AND "occurredAt" >= ${startDate}
    GROUP BY day
    ORDER BY day ASC
  `;
}

async function getRetention(startDate: Date, currentWeekStart: Date, endDate: Date) {
  const rows = await prisma.$queryRaw<RetentionRow[]>`
    WITH active AS (
      SELECT "userId", "occurredAt" AS active_at
      FROM "analytics_events"
      WHERE "userId" IS NOT NULL AND "occurredAt" >= ${startDate} AND "occurredAt" < ${endDate}

      UNION

      SELECT "userId", "createdAt" AS active_at
      FROM "knowledge_items"
      WHERE "createdAt" >= ${startDate} AND "createdAt" < ${endDate}

      UNION

      SELECT "userId", "createdAt" AS active_at
      FROM "conversations"
      WHERE "createdAt" >= ${startDate} AND "createdAt" < ${endDate}

      UNION

      SELECT "userId", "createdAt" AS active_at
      FROM "feedback"
      WHERE "createdAt" >= ${startDate} AND "createdAt" < ${endDate}
    ),
    previous_users AS (
      SELECT DISTINCT "userId"
      FROM active
      WHERE active_at >= ${startDate} AND active_at < ${currentWeekStart}
    ),
    current_users AS (
      SELECT DISTINCT "userId"
      FROM active
      WHERE active_at >= ${currentWeekStart} AND active_at < ${endDate}
    )
    SELECT
      (SELECT COUNT(*) FROM previous_users) AS "previousActiveUsers",
      (SELECT COUNT(*) FROM current_users) AS "currentActiveUsers",
      (SELECT COUNT(*) FROM previous_users p INNER JOIN current_users c ON c."userId" = p."userId") AS "retainedUsers"
  `;

  const row = rows[0] ?? {
    previousActiveUsers: 0,
    currentActiveUsers: 0,
    retainedUsers: 0
  };
  const previousActiveUsers = toNumber(row.previousActiveUsers);
  const retainedUsers = toNumber(row.retainedUsers);

  return {
    previousActiveUsers,
    currentActiveUsers: toNumber(row.currentActiveUsers),
    retainedUsers,
    rate: previousActiveUsers > 0 ? round(retainedUsers / previousActiveUsers, 4) : null
  };
}

export async function GET(request: Request) {
  try {
    await requireAdminUser();
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("加载运营数据"));
  }

  try {
    const days = parseDays(request);
    const today = startOfToday();
    const startDate = addDays(today, -(days - 1));
    const endDate = addDays(today, 1);
    const currentWeekStart = addDays(endDate, -7);
    const series = buildBaseSeries(startDate, days);
    const byDate = indexSeries(series);
    const [
      activeRows,
      knowledgeRows,
      questionRows,
      retrievalRows,
      aiRows,
      uploadRows,
      retention
    ] = await Promise.all([
      getDailyActiveRows(startDate),
      getDailyKnowledgeRows(startDate),
      getDailyQuestionRows(startDate),
      getDailyRetrievalRows(startDate),
      getDailyAiCostRows(startDate),
      getDailyUploadRows(startDate),
      getRetention(addDays(endDate, -14), currentWeekStart, endDate)
    ]);

    activeRows.forEach((row) => {
      const item = byDate.get(toDateKey(row.day));

      if (item) {
        item.dailyActiveUsers = toNumber(row.count);
      }
    });

    knowledgeRows.forEach((row) => {
      const item = byDate.get(toDateKey(row.day));

      if (item) {
        item.newKnowledgeCount = toNumber(row.count);
      }
    });

    questionRows.forEach((row) => {
      const item = byDate.get(toDateKey(row.day));

      if (item) {
        item.questionCount = toNumber(row.count);
      }
    });

    retrievalRows.forEach((row) => {
      const item = byDate.get(toDateKey(row.day));

      if (item) {
        item.averageRetrievalHitCount = row.average === null ? null : round(toNumber(row.average), 2);
      }
    });

    aiRows.forEach((row) => {
      const item = byDate.get(toDateKey(row.day));

      if (item) {
        item.aiCallCount = toNumber(row.callCount);
        item.aiEstimatedCostUsd = round(toNumber(row.estimatedCostUsd), 6);
        item.aiTotalTokens = toNumber(row.totalTokens);
      }
    });

    uploadRows.forEach((row) => {
      const item = byDate.get(toDateKey(row.day));

      if (item) {
        item.uploadFileCount = toNumber(row.count);
      }
    });

    const totalRetrievalEvents = retrievalRows.reduce((total, row) => total + toNumber(row.count), 0);
    const weightedRetrievalHits = retrievalRows.reduce((total, row) => {
      return total + (toNumber(row.average) * toNumber(row.count));
    }, 0);
    const summary = {
      dailyActiveUsersToday: series[series.length - 1]?.dailyActiveUsers ?? 0,
      newKnowledgeTotal: sum(series.map((item) => item.newKnowledgeCount)),
      questionTotal: sum(series.map((item) => item.questionCount)),
      averageRetrievalHitCount: totalRetrievalEvents > 0
        ? round(weightedRetrievalHits / totalRetrievalEvents, 2)
        : null,
      aiCallTotal: sum(series.map((item) => item.aiCallCount)),
      aiEstimatedCostUsd: round(sum(series.map((item) => item.aiEstimatedCostUsd)), 6),
      aiTotalTokens: sum(series.map((item) => item.aiTotalTokens)),
      uploadFileTotal: sum(series.map((item) => item.uploadFileCount)),
      retentionRate: retention.rate
    };
    const empty = series.every((item) => (
      item.dailyActiveUsers === 0 &&
      item.newKnowledgeCount === 0 &&
      item.questionCount === 0 &&
      item.averageRetrievalHitCount === null &&
      item.aiCallCount === 0 &&
      item.uploadFileCount === 0
    ));

    return apiSuccess<AdminAnalyticsResponse>({
      range: {
        days,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      },
      summary,
      retention,
      series,
      empty
    });
  } catch (error) {
    return apiError(error);
  }
}
