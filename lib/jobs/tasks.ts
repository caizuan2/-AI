import { prisma } from "@/lib/prisma";
import { refreshCompletionSuggestionsForItem } from "@/lib/knowledge/completion-suggestions";
import { hasDatabaseUrl } from "@/lib/server-config-core";
import { runLoggedTask, type TaskLogger } from "@/lib/jobs/logger";

const LOW_QUALITY_REFRESH_LIMIT = 20;
const LOW_QUALITY_SUGGESTION_TTL_HOURS = 24;

export interface CheckStaleKnowledgeTaskResult {
  markedStale: number;
  skipped: boolean;
}

export interface RefreshLowQualitySuggestionsTaskResult {
  scanned: number;
  refreshed: number;
  failed: number;
  skipped: boolean;
}

export interface CleanupOrphanChunksTaskResult {
  deletedChunks: number;
  skipped: boolean;
}

export interface BackgroundTasksResult {
  stale: CheckStaleKnowledgeTaskResult;
  suggestions: RefreshLowQualitySuggestionsTaskResult;
  cleanup: CleanupOrphanChunksTaskResult;
}

function skipWhenDatabaseMissing(logger: TaskLogger, action: string) {
  if (hasDatabaseUrl()) {
    return false;
  }

  logger.warn(`DATABASE_URL is missing; skipped ${action}.`);
  return true;
}

export async function checkStaleKnowledgeTask(): Promise<CheckStaleKnowledgeTaskResult> {
  return runLoggedTask("check-stale-knowledge", async (logger) => {
    if (skipWhenDatabaseMissing(logger, "stale knowledge check")) {
      return {
        markedStale: 0,
        skipped: true
      };
    }

    const result = await prisma.knowledgeItem.updateMany({
      where: {
        status: "active",
        expiresAt: {
          lte: new Date()
        }
      },
      data: {
        status: "stale"
      }
    });

    logger.info("marked stale knowledge items", {
      count: result.count
    });

    return {
      markedStale: result.count,
      skipped: false
    };
  });
}

export async function refreshLowQualitySuggestionsTask(
  limit = LOW_QUALITY_REFRESH_LIMIT
): Promise<RefreshLowQualitySuggestionsTaskResult> {
  return runLoggedTask("refresh-low-quality-suggestions", async (logger) => {
    if (skipWhenDatabaseMissing(logger, "low-quality suggestion refresh")) {
      return {
        scanned: 0,
        refreshed: 0,
        failed: 0,
        skipped: true
      };
    }

    const staleBefore = new Date(Date.now() - LOW_QUALITY_SUGGESTION_TTL_HOURS * 60 * 60 * 1000);
    const items = await prisma.knowledgeItem.findMany({
      where: {
        status: {
          not: "archived"
        },
        AND: [
          {
            OR: [
              { clarityScore: { lt: 3 } },
              { completenessScore: { lt: 3 } },
              { usefulnessScore: { lt: 3 } },
              { confidenceScore: { lt: 3 } }
            ]
          },
          {
            OR: [
              {
                completionSuggestions: {
                  none: {}
                }
              },
              {
                completionSuggestions: {
                  some: {
                    updatedAt: {
                      lt: staleBefore
                    }
                  }
                }
              }
            ]
          }
        ]
      },
      orderBy: [{ updatedAt: "asc" }],
      take: Math.max(1, Math.min(limit, LOW_QUALITY_REFRESH_LIMIT)),
      select: {
        id: true,
        title: true,
        summary: true,
        content: true,
        tags: true,
        category: true,
        importance: true,
        clarityScore: true,
        completenessScore: true,
        usefulnessScore: true,
        confidenceScore: true
      }
    });

    let refreshed = 0;
    let failed = 0;

    for (const item of items) {
      try {
        const result = await refreshCompletionSuggestionsForItem(item);
        refreshed += 1;
        logger.info("refreshed suggestions", {
          knowledgeItemId: item.id,
          suggestions: result.suggestions.length,
          mode: result.mode
        });
      } catch (error) {
        failed += 1;
        logger.error("failed to refresh suggestions for item", {
          knowledgeItemId: item.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    logger.info("refresh summary", {
      scanned: items.length,
      refreshed,
      failed
    });

    return {
      scanned: items.length,
      refreshed,
      failed,
      skipped: false
    };
  });
}

export async function cleanupOrphanChunksTask(): Promise<CleanupOrphanChunksTaskResult> {
  return runLoggedTask("cleanup-orphan-chunks", async (logger) => {
    if (skipWhenDatabaseMissing(logger, "orphan chunk cleanup")) {
      return {
        deletedChunks: 0,
        skipped: true
      };
    }

    const deletedChunks = await prisma.$executeRaw`
      DELETE FROM "knowledge_chunks" AS chunk
      WHERE NOT EXISTS (
        SELECT 1
        FROM "knowledge_items" AS item
        WHERE item."id" = chunk."knowledgeItemId"
      )
    `;

    logger.info("removed orphan chunks", {
      count: deletedChunks
    });

    return {
      deletedChunks,
      skipped: false
    };
  });
}

export async function runAllBackgroundTasksOnce(): Promise<BackgroundTasksResult> {
  const stale = await checkStaleKnowledgeTask();
  const suggestions = await refreshLowQualitySuggestionsTask();
  const cleanup = await cleanupOrphanChunksTask();

  return {
    stale,
    suggestions,
    cleanup
  };
}
