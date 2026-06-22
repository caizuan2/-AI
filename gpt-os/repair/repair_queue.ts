export type RepairQueueStatus = "pending_review" | "approved" | "rejected" | "applied";

export interface RepairQueueItem<TPatch = unknown> {
  id: string;
  patch: TPatch;
  status: RepairQueueStatus;
  created_at: string;
  note: string;
}

export function createPendingRepairQueueItem<TPatch>(
  patch: TPatch,
  options?: {
    id?: string;
    createdAt?: Date;
    note?: string;
  },
): RepairQueueItem<TPatch> {
  return {
    id: options?.id ?? createRepairQueueId(),
    patch,
    status: "pending_review",
    created_at: (options?.createdAt ?? new Date()).toISOString(),
    note: options?.note ?? "等待人工审核，不会自动应用。",
  };
}

function createRepairQueueId(): string {
  return `repair_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
