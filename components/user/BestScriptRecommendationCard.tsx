"use client";

import { useState } from "react";
import { Check, Copy, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { recordScriptPerformance } from "@/lib/knowledge-runtime/runtime-v3-script-performance-store";
import { recordRuntimeV4FeedbackEvent } from "@/lib/knowledge-runtime/runtime-v4-feedback-event-store";
import type {
  RuntimeV3BestScriptRecommendation,
  RuntimeV3GrowthOutput,
  RuntimeV3LearningSignal,
  RuntimeV3ScriptVariant,
} from "@/lib/knowledge-runtime/runtime-v3-sales-learning-types";
import type { RuntimeV4FeedbackEvent } from "@/lib/knowledge-runtime/runtime-v4-growth-types";

async function safeCopyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function signalForVariant(id: string): RuntimeV3LearningSignal {
  if (id.toUpperCase() === "A") return "copied_variant_a";
  if (id.toUpperCase() === "B") return "copied_variant_b";
  return "copied_variant_c";
}

function feedbackEventForVariant(id: string): RuntimeV4FeedbackEvent {
  if (id.toUpperCase() === "A") return "copy_variant_a";
  if (id.toUpperCase() === "B") return "copy_variant_b";
  return "copy_variant_c";
}

function VariantCard({
  variant,
  recommended,
  scope,
}: {
  variant: RuntimeV3ScriptVariant;
  recommended: boolean;
  scope?: RuntimeV3GrowthOutput["isolationScope"] | null;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await safeCopyText(variant.message);
    if (scope) {
      recordScriptPerformance({
        scope,
        signal: signalForVariant(variant.id),
        variantId: variant.id,
        tone: variant.tone,
        reason: "用户复制了推荐话术版本。",
      });
      recordRuntimeV4FeedbackEvent({
        scope,
        event: feedbackEventForVariant(variant.id),
        variantId: variant.id,
        customerSegment: undefined,
        meta: {
          tone: variant.tone,
          reason: "用户复制了推荐话术版本。",
        },
      });
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <article className={cn(
      "rounded-2xl bg-white/85 px-3 py-3 text-xs leading-5 ring-1",
      recommended ? "ring-emerald-300" : "ring-emerald-100"
    )}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="font-semibold text-emerald-950">
          {variant.id}. {variant.label}
          {recommended ? <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">推荐</span> : null}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-50 px-2 py-1 font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-white"
        >
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <p className="text-slate-800">{variant.message}</p>
      <p className="mt-2 text-emerald-700">适用：{variant.bestFor}</p>
    </article>
  );
}

export function BestScriptRecommendationCard({
  recommendation,
  scope,
  className,
}: {
  recommendation?: RuntimeV3BestScriptRecommendation | null;
  scope?: RuntimeV3GrowthOutput["isolationScope"] | null;
  className?: string;
}) {
  if (!recommendation || recommendation.alternatives.length === 0) return null;

  return (
    <div className={cn("rounded-2xl bg-white/85 px-3 py-3 text-xs leading-5 text-emerald-900 ring-1 ring-emerald-100", className)}>
      <div className="mb-2 flex items-center gap-2 font-semibold">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        最优话术推荐
      </div>
      <p className="mb-3 text-emerald-800">{recommendation.reason}</p>
      <div className="space-y-2">
        {recommendation.alternatives.slice(0, 3).map((variant) => (
          <VariantCard
            key={variant.id}
            variant={variant}
            recommended={variant.id === recommendation.recommendedVariantId}
            scope={scope}
          />
        ))}
      </div>
    </div>
  );
}
