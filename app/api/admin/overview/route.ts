import { prisma } from "@/lib/prisma";
import { requireAdminUser } from "@/lib/admin";
import { apiError, apiSuccess } from "@/lib/api-response";
import { writeAuditLog } from "@/lib/audit-log";
import {
  countRecentLogEntries,
  getRecentLogEntries,
  type StoredLogEntry
} from "@/lib/logger";
import { hasDatabaseUrl, hasUsableOpenAIKey } from "@/lib/server-config";

export const dynamic = "force-dynamic";

type HealthStatus = "healthy" | "degraded" | "down";

interface AdminOverviewResponse {
  metrics: {
    userCount: number | null;
    knowledgeCount: number | null;
    aiCallsToday: number;
    recentErrorCount: number;
    inactiveLicenseCount: number | null;
    openFeedbackCount: number | null;
  };
  health: {
    status: HealthStatus;
    checkedAt: string;
    database: {
      ok: boolean;
      latencyMs: number | null;
      configured: boolean;
    };
    openai: {
      configured: boolean;
    };
    logging: {
      recentEntryCount: number;
      inMemoryWindow: boolean;
    };
  };
  recentErrors: Array<{
    timestamp: string;
    level: string;
    event: string;
    requestId: unknown;
    path: unknown;
    method: unknown;
    operation: unknown;
    code: unknown;
    statusCode: unknown;
    error: unknown;
  }>;
  users: Array<{
    id: string;
    email: string | null;
    phone: string | null;
    name: string;
    licenseActivated: boolean;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
  feedback: Array<{
    id: string;
    type: string;
    content: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    user: {
      id: string;
      email: string | null;
      phone: string | null;
      name: string;
    };
  }>;
}

function startOfToday() {
  const date = new Date();

  date.setHours(0, 0, 0, 0);

  return date;
}

function isErrorLikeEntry(entry: StoredLogEntry) {
  return entry.level === "error" || entry.event === "api.error" || entry.event.endsWith("_failed");
}

function serializeErrorEntry(entry: StoredLogEntry): AdminOverviewResponse["recentErrors"][number] {
  return {
    timestamp: entry.timestamp,
    level: entry.level,
    event: entry.event,
    requestId: entry.requestId,
    path: entry.path,
    method: entry.method,
    operation: entry.operation,
    code: entry.code,
    statusCode: entry.statusCode,
    error: entry.error
  };
}

async function collectDatabaseMetrics() {
  if (!hasDatabaseUrl()) {
    return {
      userCount: null,
      knowledgeCount: null,
      inactiveLicenseCount: null,
      users: [],
      openFeedbackCount: null,
      feedback: [],
      database: {
        ok: false,
        latencyMs: null,
        configured: false
      }
    };
  }

  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;

    const [userCount, knowledgeCount, inactiveLicenseCount, openFeedbackCount, users, feedback] = await prisma.$transaction([
      prisma.user.count(),
      prisma.knowledgeItem.count({
        where: {
          deletedAt: null
        }
      }),
      prisma.user.count({
        where: {
          licenseActivated: false
        }
      }),
      prisma.feedback.count({
        where: {
          status: "OPEN"
        }
      }),
      prisma.user.findMany({
        orderBy: [
          { licenseActivated: "asc" },
          { createdAt: "desc" }
        ],
        take: 50,
        select: {
          id: true,
          email: true,
          phone: true,
          name: true,
          licenseActivated: true,
          isActive: true,
          createdAt: true,
          updatedAt: true
        }
      }),
      prisma.feedback.findMany({
        orderBy: {
          createdAt: "desc"
        },
        take: 50,
        select: {
          id: true,
          type: true,
          content: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              email: true,
              phone: true,
              name: true
            }
          }
        }
      })
    ]);

    return {
      userCount,
      knowledgeCount,
      inactiveLicenseCount,
      users,
      openFeedbackCount,
      feedback,
      database: {
        ok: true,
        latencyMs: Date.now() - startedAt,
        configured: true
      }
    };
  } catch {
    return {
      userCount: null,
      knowledgeCount: null,
      inactiveLicenseCount: null,
      users: [],
      openFeedbackCount: null,
      feedback: [],
      database: {
        ok: false,
        latencyMs: Date.now() - startedAt,
        configured: true
      }
    };
  }
}

function deriveHealthStatus(input: {
  databaseOk: boolean;
  openaiConfigured: boolean;
  recentErrorCount: number;
}): HealthStatus {
  if (!input.databaseOk) {
    return "down";
  }

  if (!input.openaiConfigured || input.recentErrorCount >= 5) {
    return "degraded";
  }

  return "healthy";
}

export async function GET(request: Request) {
  let admin: Awaited<ReturnType<typeof requireAdminUser>>;

  try {
    admin = await requireAdminUser(request);
  } catch (error) {
    return apiError(error);
  }

  try {
    const today = startOfToday();
    const databaseMetrics = await collectDatabaseMetrics();
    const recentEntries = getRecentLogEntries({ limit: 100 });
    const recentErrors = recentEntries.filter(isErrorLikeEntry).slice(0, 12);
    const recentErrorCount = countRecentLogEntries((entry) => {
      const loggedAt = new Date(entry.timestamp).getTime();
      const oneHourAgo = Date.now() - 60 * 60 * 1000;

      return loggedAt >= oneHourAgo && isErrorLikeEntry(entry);
    });
    const aiCallsToday = countRecentLogEntries((entry) => {
      return entry.event === "ai.call" && new Date(entry.timestamp).getTime() >= today.getTime();
    });
    const openaiConfigured = hasUsableOpenAIKey();
    const status = deriveHealthStatus({
      databaseOk: databaseMetrics.database.ok,
      openaiConfigured,
      recentErrorCount
    });

    await writeAuditLog({
      userId: admin.id,
      role: admin.role,
      action: "ADMIN_OVERVIEW_VIEW",
      targetType: "admin",
      request,
      metadata: {
        healthStatus: status
      }
    });

    return apiSuccess<AdminOverviewResponse>({
      metrics: {
        userCount: databaseMetrics.userCount,
        knowledgeCount: databaseMetrics.knowledgeCount,
        aiCallsToday,
        recentErrorCount,
        inactiveLicenseCount: databaseMetrics.inactiveLicenseCount,
        openFeedbackCount: databaseMetrics.openFeedbackCount
      },
      health: {
        status,
        checkedAt: new Date().toISOString(),
        database: databaseMetrics.database,
        openai: {
          configured: openaiConfigured
        },
        logging: {
          recentEntryCount: recentEntries.length,
          inMemoryWindow: true
        }
      },
      recentErrors: recentErrors.map(serializeErrorEntry),
      users: databaseMetrics.users.map((user) => ({
        ...user,
        name: user.name ?? user.phone ?? user.email ?? user.id,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString()
      })),
      feedback: databaseMetrics.feedback.map((item) => ({
        ...item,
        user: {
          ...item.user,
          name: item.user.name ?? item.user.phone ?? item.user.email ?? item.user.id
        },
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString()
      }))
    });
  } catch (error) {
    return apiError(error);
  }
}
