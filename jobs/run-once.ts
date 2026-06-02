import { prisma } from "@/lib/prisma-client";
import { createTaskLogger } from "@/lib/jobs/logger";
import { runAllBackgroundTasksOnce } from "@/lib/jobs/tasks";

const logger = createTaskLogger("run-once");

runAllBackgroundTasksOnce()
  .then((result) => {
    logger.info("all tasks finished", {
      staleMarked: result.stale.markedStale,
      lowQualityScanned: result.suggestions.scanned,
      suggestionsRefreshed: result.suggestions.refreshed,
      orphanChunksDeleted: result.cleanup.deletedChunks
    });
  })
  .catch((error) => {
    logger.error("run-once failed", {
      error: error instanceof Error ? error.message : String(error)
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
