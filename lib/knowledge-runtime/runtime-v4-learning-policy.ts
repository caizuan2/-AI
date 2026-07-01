import type { RuntimeV4FeedbackEvent, RuntimeV4Scope } from "./runtime-v4-growth-types";
import { hasCompleteRuntimeV4Scope } from "./runtime-v4-feedback-event-store";

export function shouldUseRuntimeV4Feedback(scope?: RuntimeV4Scope | null) {
  return hasCompleteRuntimeV4Scope(scope);
}

export function isRuntimeV4SampleEnough(totalEvents: number) {
  return totalEvents >= 3;
}

export function normalizeRuntimeV4VariantEvent(event: RuntimeV4FeedbackEvent, variantId?: string) {
  if (variantId) return variantId.toUpperCase();
  if (event === "copy_variant_a") return "A";
  if (event === "copy_variant_b") return "B";
  if (event === "copy_variant_c") return "C";
  return undefined;
}
