export type AutonomyDecisionType = "suggest" | "repair" | "wait" | "escalate";
export type AutonomyDecisionLevel =
  "level_0_observe" |
  "level_1_suggest" |
  "level_2_prepare_patch" |
  "level_3_await_approval" |
  "level_4_execute_controlled";

export interface AutonomyEngineInput {
  systemHealthScore: number;
  relevanceScore: number;
  fallbackRate?: number;
  improvementPressure?: number;
  controlledExecutionAllowed?: boolean;
}

export interface AutonomyDecision {
  decision: AutonomyDecisionType;
  level: AutonomyDecisionLevel;
  confidence: number;
  emergency_analysis_mode: boolean;
  reason: string;
  suggested_action: "analyze" | "suggest" | "prepare_patch" | "execute_controlled";
}

export function decideAutonomousAction(input: AutonomyEngineInput): AutonomyDecision {
  if (input.systemHealthScore < 30) {
    return {
      decision: "escalate",
      level: "level_1_suggest",
      confidence: 0.92,
      emergency_analysis_mode: true,
      reason: "system_health_score is below 30; only suggestion mode is allowed.",
      suggested_action: "suggest",
    };
  }

  if (input.relevanceScore < 0.2) {
    return {
      decision: "repair",
      level: "level_2_prepare_patch",
      confidence: 0.86,
      emergency_analysis_mode: false,
      reason: "relevance_score is below 0.2; prepare a knowledge repair patch for review.",
      suggested_action: "prepare_patch",
    };
  }

  if ((input.fallbackRate ?? 0) > 0.2 || (input.improvementPressure ?? 0) > 70) {
    return {
      decision: "suggest",
      level: "level_1_suggest",
      confidence: 0.74,
      emergency_analysis_mode: false,
      reason: "fallback or improvement pressure is elevated; generate optimization suggestions.",
      suggested_action: "suggest",
    };
  }

  if (input.systemHealthScore > 80 && input.controlledExecutionAllowed === true) {
    return {
      decision: "repair",
      level: "level_4_execute_controlled",
      confidence: 0.7,
      emergency_analysis_mode: false,
      reason: "system health is high enough for approved controlled execution.",
      suggested_action: "execute_controlled",
    };
  }

  return {
    decision: "wait",
    level: "level_0_observe",
    confidence: 0.68,
    emergency_analysis_mode: false,
    reason: "system health is acceptable; continue observation.",
    suggested_action: "analyze",
  };
}
