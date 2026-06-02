import cron, { type ScheduledTask } from "node-cron";
import { prisma } from "@/lib/prisma-client";
import { createTaskLogger } from "@/lib/jobs/logger";
import {
  checkStaleKnowledgeTask,
  cleanupOrphanChunksTask,
  refreshLowQualitySuggestionsTask
} from "@/lib/jobs/tasks";

type BackgroundTask = () => Promise<unknown>;

const schedulerLogger = createTaskLogger("scheduler");
const timezone = process.env.JOBS_TIMEZONE || "Asia/Shanghai";
const runningTasks = new Set<string>();
const scheduledTasks: ScheduledTask[] = [];

async function runWithLock(taskName: string, task: BackgroundTask) {
  if (runningTasks.has(taskName)) {
    schedulerLogger.warn("task is already running; skipped overlapping run", {
      taskName
    });
    return;
  }

  runningTasks.add(taskName);

  try {
    await task();
  } finally {
    runningTasks.delete(taskName);
  }
}

function scheduleTask(taskName: string, expression: string, task: BackgroundTask) {
  const scheduledTask = cron.schedule(
    expression,
    () => {
      void runWithLock(taskName, task);
    },
    {
      timezone
    }
  );

  scheduledTasks.push(scheduledTask);
  schedulerLogger.info("scheduled task", {
    taskName,
    expression,
    timezone
  });
}

async function shutdown(signal: string) {
  schedulerLogger.info("received shutdown signal", {
    signal
  });

  for (const task of scheduledTasks) {
    task.stop();
  }

  await prisma.$disconnect();
  process.exit(0);
}

scheduleTask("check-stale-knowledge", "0 * * * *", checkStaleKnowledgeTask);
scheduleTask("refresh-low-quality-suggestions", "15 3 * * *", refreshLowQualitySuggestionsTask);
scheduleTask("cleanup-orphan-chunks", "0 4 * * *", cleanupOrphanChunksTask);

void runWithLock("check-stale-knowledge", checkStaleKnowledgeTask);

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
