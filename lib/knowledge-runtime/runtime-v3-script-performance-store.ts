import type {
  RuntimeV3LearningEvent,
  RuntimeV3LearningScope,
  RuntimeV3ScriptVariant,
} from "./runtime-v3-sales-learning-types";
import {
  saveRuntimeV3Learning,
  summarizeRuntimeV3Learning,
} from "./runtime-v3-local-learning-store";

export function recordScriptPerformance(input: {
  scope: RuntimeV3LearningScope;
  signal: RuntimeV3LearningEvent["signal"];
  variantId?: string;
  tone?: RuntimeV3ScriptVariant["tone"];
  reason?: string;
}) {
  return saveRuntimeV3Learning(input.scope, {
    signal: input.signal,
    variantId: input.variantId,
    tone: input.tone,
    reason: input.reason,
    createdAt: new Date().toISOString(),
    scoreDelta: ["disliked_answer", "ignored_response", "manual_negative"].includes(input.signal) ? -1 : 1,
  });
}

export function getScriptPerformanceSummary(scope: RuntimeV3LearningScope) {
  return summarizeRuntimeV3Learning(scope);
}

export function rankScriptVariants(input: {
  scope: RuntimeV3LearningScope;
  variants: RuntimeV3ScriptVariant[];
}) {
  const summary = summarizeRuntimeV3Learning(input.scope);

  return [...input.variants].sort((a, b) => {
    const scoreA =
      (summary.copiedVariantCounts[a.id] ?? 0) * 2 +
      (summary.copiedToneCounts[a.tone] ?? 0);
    const scoreB =
      (summary.copiedVariantCounts[b.id] ?? 0) * 2 +
      (summary.copiedToneCounts[b.tone] ?? 0);

    return scoreB - scoreA;
  });
}
