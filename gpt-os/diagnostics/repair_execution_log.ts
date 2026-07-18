export type RepairExecutionStatus = "skipped" | "blocked" | "executed";

export interface RepairExecutionLog {
  patch_id: string;
  execution_status: RepairExecutionStatus;
  before_state: unknown;
  after_state: unknown;
  rollback_available: true;
  reason?: string;
  created_at: string;
}

export function createRepairExecutionLog(input: {
  patchId: string;
  executionStatus: RepairExecutionStatus;
  beforeState: unknown;
  afterState: unknown;
  reason?: string;
  createdAt?: Date;
}): RepairExecutionLog {
  return {
    patch_id: input.patchId,
    execution_status: input.executionStatus,
    before_state: input.beforeState,
    after_state: input.afterState,
    rollback_available: true,
    reason: input.reason,
    created_at: (input.createdAt ?? new Date()).toISOString(),
  };
}
