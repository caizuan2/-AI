export type MetaAction =
  | "system_design"
  | "architecture_proposal"
  | "abstraction_modeling"
  | "rewrite_kernel"
  | "replace_rag"
  | "modify_agent"
  | "modify_repair"
  | "modify_evolution"
  | "write_production_code";

export interface MetaSafetyDecision {
  action: MetaAction;
  allowed: boolean;
  reason: string;
  is_design_only: boolean;
  is_execution_blocked: boolean;
}

const allowedDesignActions: MetaAction[] = [
  "system_design",
  "architecture_proposal",
  "abstraction_modeling",
];

export function evaluateMetaSafety(action: MetaAction): MetaSafetyDecision {
  const allowed = allowedDesignActions.includes(action);

  return {
    action,
    allowed,
    reason: allowed ? "meta_design_action_allowed" : "structural_execution_blocked",
    is_design_only: true,
    is_execution_blocked: !allowed,
  };
}

export function assertMetaDesignOnly(actions: MetaAction[]): MetaSafetyDecision[] {
  return actions.map(evaluateMetaSafety);
}
