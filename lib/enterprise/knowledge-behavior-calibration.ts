import type {
  KnowledgeBehaviorScoreSignal,
  KnowledgeBehaviorSignalInput
} from "@/lib/enterprise/knowledge-behavior-types";

function clampDelta(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(-0.2, Math.min(0.2, value));
}

function round4(value: number) {
  return Math.round(clampDelta(value) * 10000) / 10000;
}

function dwellSignal(dwellMs: number | null | undefined): KnowledgeBehaviorScoreSignal {
  const safeDwellMs = typeof dwellMs === "number" && Number.isFinite(dwellMs) ? dwellMs : 0;

  if (safeDwellMs <= 0) {
    return { behaviorScoreDelta: 0, reason: "dwell_unknown" };
  }

  if (safeDwellMs < 3000) {
    return { behaviorScoreDelta: -0.03, reason: "short_dwell" };
  }

  if (safeDwellMs < 10000) {
    return { behaviorScoreDelta: 0.02, reason: "normal_dwell" };
  }

  if (safeDwellMs < 30000) {
    return { behaviorScoreDelta: 0.05, reason: "long_dwell" };
  }

  return { behaviorScoreDelta: 0.07, reason: "deep_dwell" };
}

export function calculateBehaviorScoreSignal(input: KnowledgeBehaviorSignalInput): KnowledgeBehaviorScoreSignal {
  const eventType = input.eventType;

  if (eventType === "answer_dwell") {
    const signal = dwellSignal(input.dwellMs);

    return {
      behaviorScoreDelta: round4(signal.behaviorScoreDelta),
      reason: signal.reason
    };
  }

  const signalByType: Record<string, KnowledgeBehaviorScoreSignal> = {
    answer_view: { behaviorScoreDelta: 0.01, reason: "answer_viewed" },
    answer_copy: { behaviorScoreDelta: 0.1, reason: "answer_copied" },
    source_click: { behaviorScoreDelta: 0.05, reason: "source_opened" },
    save_knowledge: { behaviorScoreDelta: 0.12, reason: "knowledge_saved" },
    follow_up_question: { behaviorScoreDelta: -0.04, reason: "follow_up_needed" },
    regenerate_answer: { behaviorScoreDelta: -0.1, reason: "answer_regenerated" },
    agent_switch: { behaviorScoreDelta: -0.06, reason: "agent_switched" },
    second_question: { behaviorScoreDelta: 0.02, reason: "continued_question" },
    feedback_up: { behaviorScoreDelta: 0.08, reason: "explicit_positive_feedback" },
    feedback_down: { behaviorScoreDelta: -0.12, reason: "explicit_negative_feedback" }
  };
  const signal = signalByType[eventType] ?? { behaviorScoreDelta: 0, reason: "unknown_behavior_event" };

  return {
    behaviorScoreDelta: round4(signal.behaviorScoreDelta),
    reason: signal.reason
  };
}

export function calculateBehaviorScoreDelta(input: KnowledgeBehaviorSignalInput): number {
  return calculateBehaviorScoreSignal(input).behaviorScoreDelta;
}
