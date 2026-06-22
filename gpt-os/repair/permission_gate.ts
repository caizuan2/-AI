import type { RepairQueueItem } from "./repair_queue";

export interface RepairPermissionPolicy {
  auto_execute: false;
  manual_approve_required: true;
  admin_only_execution: true;
}

export interface RepairPermissionInput {
  item: RepairQueueItem;
  actorRole?: "admin" | "user" | "system";
  autoExecute?: boolean;
  policy?: RepairPermissionPolicy;
}

export interface RepairPermissionDecision {
  allowed: boolean;
  policy: RepairPermissionPolicy;
  reason: string;
}

export function getDefaultRepairPermissionPolicy(): RepairPermissionPolicy {
  return {
    auto_execute: false,
    manual_approve_required: true,
    admin_only_execution: true,
  };
}

export function canExecuteRepairPatch(input: RepairPermissionInput): RepairPermissionDecision {
  const policy = input.policy ?? getDefaultRepairPermissionPolicy();

  if (input.autoExecute || policy.auto_execute) {
    return {
      allowed: false,
      policy,
      reason: "auto_execute is disabled; repair execution requires manual review.",
    };
  }

  if (policy.manual_approve_required && input.item.status !== "approved") {
    return {
      allowed: false,
      policy,
      reason: `patch status is ${input.item.status}; approved status is required.`,
    };
  }

  if (policy.admin_only_execution && input.actorRole !== "admin") {
    return {
      allowed: false,
      policy,
      reason: "admin_only_execution is enabled; admin actor is required.",
    };
  }

  return {
    allowed: true,
    policy,
    reason: "manual approved execution is allowed.",
  };
}
