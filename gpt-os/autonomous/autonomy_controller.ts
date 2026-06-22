export type AutonomyRuntimeMode = "observe" | "assist" | "autonomous_controlled";
export type AutonomousAllowedAction = "analyze" | "suggest" | "prepare_patch" | "execute_controlled";
export type AutonomousRestrictedAction =
  "auto_write_db" |
  "auto_modify_rag" |
  "auto_override_prompt" |
  "auto_execute_patch" |
  "auto_rebuild_index";

export interface AutonomyControlState {
  mode: AutonomyRuntimeMode;
  autonomy_mode: false;
  autonomy_enabled: false;
  auto_execute: false;
  manual_approval_required: true;
  safety_guard_enabled: true;
  rollback_required: true;
  allowed_actions: AutonomousAllowedAction[];
  restricted_actions: AutonomousRestrictedAction[];
}

export interface AutonomyActionDecision {
  allowed: boolean;
  action: string;
  reason: string;
  control: AutonomyControlState;
}

export function createDefaultAutonomyControlState(): AutonomyControlState {
  return {
    mode: "observe",
    autonomy_mode: false,
    autonomy_enabled: false,
    auto_execute: false,
    manual_approval_required: true,
    safety_guard_enabled: true,
    rollback_required: true,
    allowed_actions: ["analyze", "suggest", "prepare_patch"],
    restricted_actions: [
      "auto_write_db",
      "auto_modify_rag",
      "auto_override_prompt",
      "auto_execute_patch",
      "auto_rebuild_index",
    ],
  };
}

export function evaluateAutonomousAction(
  action: string,
  control: AutonomyControlState = createDefaultAutonomyControlState(),
): AutonomyActionDecision {
  if (control.restricted_actions.includes(action as AutonomousRestrictedAction)) {
    return {
      allowed: false,
      action,
      reason: "action is restricted and requires human approval.",
      control,
    };
  }

  if (!control.allowed_actions.includes(action as AutonomousAllowedAction)) {
    return {
      allowed: false,
      action,
      reason: "action is not listed in allowed autonomous actions.",
      control,
    };
  }

  if (action === "execute_controlled" && control.mode !== "autonomous_controlled") {
    return {
      allowed: false,
      action,
      reason: "controlled execution requires autonomous_controlled mode and human approval.",
      control,
    };
  }

  return {
    allowed: true,
    action,
    reason: "action is allowed in suggestion-only autonomy mode.",
    control,
  };
}
