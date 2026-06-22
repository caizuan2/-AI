import { createRepairExecutionLog, type RepairExecutionLog } from "../diagnostics/repair_execution_log";
import type { RepairQueueItem } from "./repair_queue";

export interface RagAutoApplyInput<TPatch = unknown> {
  item: RepairQueueItem<TPatch>;
  execute?: boolean;
}

export interface RagAutoApplyResult {
  applied: boolean;
  operations: string[];
  log: RepairExecutionLog;
}

export function applyRagRepairPatch<TPatch>(input: RagAutoApplyInput<TPatch>): RagAutoApplyResult {
  const operations = [
    "chunk rewrite",
    "embedding update",
    "metadata update",
  ];

  if (input.item.status !== "approved") {
    return {
      applied: false,
      operations: [],
      log: createRepairExecutionLog({
        patchId: input.item.id,
        executionStatus: "blocked",
        beforeState: input.item,
        afterState: input.item,
        reason: `patch status is ${input.item.status}; approved status is required.`,
      }),
    };
  }

  if (input.execute !== true) {
    return {
      applied: false,
      operations,
      log: createRepairExecutionLog({
        patchId: input.item.id,
        executionStatus: "skipped",
        beforeState: input.item,
        afterState: input.item,
        reason: "execute=false; automatic RAG repair is disabled by default.",
      }),
    };
  }

  const appliedItem = {
    ...input.item,
    status: "applied" as const,
    note: "manual approved repair prepared as an execution result; no database or index write performed.",
  };

  return {
    applied: true,
    operations,
    log: createRepairExecutionLog({
      patchId: input.item.id,
      executionStatus: "executed",
      beforeState: input.item,
      afterState: appliedItem,
    }),
  };
}
