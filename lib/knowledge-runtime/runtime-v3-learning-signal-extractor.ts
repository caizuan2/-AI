import type {
  RuntimeV3LearningSignal,
} from "./runtime-v3-sales-learning-types";

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function normalizeSignal(value: string): RuntimeV3LearningSignal | null {
  const key = value.trim();
  const allowed: RuntimeV3LearningSignal[] = [
    "copied_customer_copy",
    "copied_variant_a",
    "copied_variant_b",
    "copied_variant_c",
    "liked_answer",
    "disliked_answer",
    "edited_script",
    "continued_thread",
    "asked_followup",
    "saved_response",
    "ignored_response",
    "manual_positive",
    "manual_negative",
  ];

  return allowed.includes(key as RuntimeV3LearningSignal)
    ? key as RuntimeV3LearningSignal
    : null;
}

function collectSignalsFromRecord(record: Record<string, unknown> | null) {
  if (!record) return [];

  const raw = [
    ...readStringArray(record.signals),
    ...readStringArray(record.learningSignals),
    ...readStringArray(record.runtime_v3_learning_signals),
  ];
  const nested = readRecord(record.runtime_v3_learning);

  if (nested) {
    raw.push(...readStringArray(nested.signals));
    raw.push(...readStringArray(nested.lastSignals));
  }

  return raw
    .map(normalizeSignal)
    .filter((signal): signal is RuntimeV3LearningSignal => Boolean(signal));
}

export function extractLearningSignals(input: {
  query?: string | null;
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
  userActions?: unknown;
  responseMeta?: unknown;
}) {
  const signals = new Set<RuntimeV3LearningSignal>();
  const query = (input.query ?? "").trim();
  const userTurns = (input.messages ?? []).filter((message) => message.role === "user").length;

  if (userTurns > 1) {
    signals.add("continued_thread");
  }

  if (/更短|短一点|换个|换一种|改一下|继续|再来|微信版|口语/.test(query)) {
    signals.add("asked_followup");
  }

  for (const signal of collectSignalsFromRecord(readRecord(input.userActions))) {
    signals.add(signal);
  }

  for (const signal of collectSignalsFromRecord(readRecord(input.responseMeta))) {
    signals.add(signal);
  }

  const list = Array.from(signals);
  const positive = list.filter((signal) => [
    "copied_customer_copy",
    "copied_variant_a",
    "copied_variant_b",
    "copied_variant_c",
    "liked_answer",
    "continued_thread",
    "asked_followup",
    "saved_response",
    "manual_positive",
  ].includes(signal)).length;
  const negative = list.filter((signal) => [
    "disliked_answer",
    "ignored_response",
    "manual_negative",
  ].includes(signal)).length;

  return {
    signals: list,
    signalStrength: Math.max(0, Math.min(1, 0.35 + positive * 0.12 - negative * 0.15)),
    reason: list.length > 0
      ? `识别到 ${list.length} 个用户行为信号，可用于下一轮话术优化。`
      : "暂无明确学习信号，本轮按客户分层和知识库上下文推荐话术。",
  };
}
