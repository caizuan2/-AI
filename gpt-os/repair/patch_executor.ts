import { createRepairExecutionLog, type RepairExecutionLog } from "../diagnostics/repair_execution_log";
import { applyRagRepairPatch } from "./rag_auto_applier";
import { canExecuteRepairPatch, type RepairPermissionPolicy } from "./permission_gate";
import type { RepairQueueItem } from "./repair_queue";
import { validateRepairPatchSafety, type RepairSafetyDecision } from "./safety_guard";

export interface PatchExecutorInput<TPatch = unknown> {
  item: RepairQueueItem<TPatch>;
  actorRole?: "admin" | "user" | "system";
  autoExecute?: boolean;
  manualApprovalRequired?: boolean;
  policy?: RepairPermissionPolicy;
}

export interface PatchExecutorResult<TPatch = unknown> {
  executed: boolean;
  item: RepairQueueItem<TPatch>;
  safety: RepairSafetyDecision;
  log: RepairExecutionLog;
}

export function executeRepairPatch<TPatch>(input: PatchExecutorInput<TPatch>): PatchExecutorResult<TPatch> {
  const safety = validateRepairPatchSafety(input.item.patch);

  if (!safety.isSafe) {
    return {
      executed: false,
      item: input.item,
      safety,
      log: createRepairExecutionLog({
        patchId: input.item.id,
        executionStatus: "blocked",
        beforeState: input.item,
        afterState: input.item,
        reason: safety.reasons.join(" "),
      }),
    };
  }

  if (input.autoExecute === false) {
    return {
      executed: false,
      item: input.item,
      safety,
      log: createRepairExecutionLog({
        patchId: input.item.id,
        executionStatus: "skipped",
        beforeState: input.item,
        afterState: input.item,
        reason: "auto_execute=false; patch remains in review flow.",
      }),
    };
  }

  if (input.manualApprovalRequired === true && input.item.status !== "approved") {
    return {
      executed: false,
      item: input.item,
      safety,
      log: createRepairExecutionLog({
        patchId: input.item.id,
        executionStatus: "blocked",
        beforeState: input.item,
        afterState: input.item,
        reason: "manual_approval_required=true; waiting for approved status.",
      }),
    };
  }

  const permission = canExecuteRepairPatch({
    item: input.item,
    actorRole: input.actorRole,
    autoExecute: input.autoExecute,
    policy: input.policy,
  });

  if (!permission.allowed) {
    return {
      executed: false,
      item: input.item,
      safety,
      log: createRepairExecutionLog({
        patchId: input.item.id,
        executionStatus: input.item.status === "approved" ? "skipped" : "blocked",
        beforeState: input.item,
        afterState: input.item,
        reason: permission.reason,
      }),
    };
  }

  const applyResult = applyRagRepairPatch({
    item: input.item,
    execute: true,
  });

  return {
    executed: applyResult.applied,
    item: input.item,
    safety,
    log: applyResult.log,
  };
}
