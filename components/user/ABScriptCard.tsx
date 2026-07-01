"use client";

import * as React from "react";
import { Check, Copy, MessagesSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RuntimeV2ABScripts } from "@/lib/knowledge-runtime/runtime-v2-sales-loop-types";
import { recordRuntimeV4FeedbackEvent } from "@/lib/knowledge-runtime/runtime-v4-feedback-event-store";
import type { RuntimeV4FeedbackEvent, RuntimeV4Scope } from "@/lib/knowledge-runtime/runtime-v4-growth-types";

async function copyText(text: string, target: HTMLTextAreaElement | null) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    target?.focus();
    target?.select();
    return false;
  }
}

function feedbackEventForVariant(key: string): RuntimeV4FeedbackEvent {
  if (key.toUpperCase() === "A") return "copy_variant_a";
  if (key.toUpperCase() === "B") return "copy_variant_b";
  return "copy_variant_c";
}

function CopyScriptButton({
  text,
  variantKey,
  tone,
  scope,
}: {
  text: string;
  variantKey: string;
  tone: string;
  scope?: RuntimeV4Scope | null;
}) {
  const [copied, setCopied] = React.useState(false);
  const fallbackRef = React.useRef<HTMLTextAreaElement>(null);

  async function handleCopy() {
    const ok = await copyText(text, fallbackRef.current);

    if (ok) {
      recordRuntimeV4FeedbackEvent({
        scope,
        event: feedbackEventForVariant(variantKey),
        variantId: variantKey,
        meta: {
          tone,
          reason: "用户复制了 A/B 话术。",
        },
      });
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  }

  return (
    <>
      <textarea
        ref={fallbackRef}
        value={text}
        readOnly
        tabIndex={-1}
        aria-hidden="true"
        className="fixed -left-[9999px] top-0 h-px w-px opacity-0"
      />
      <button
        type="button"
        onClick={() => void handleCopy()}
        className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100 transition hover:bg-emerald-50"
      >
        {copied ? <Check className="h-3 w-3" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
        {copied ? "已复制" : "复制"}
      </button>
    </>
  );
}

export function ABScriptCard({
  scripts,
  scope,
  className,
}: {
  scripts?: RuntimeV2ABScripts | null;
  scope?: RuntimeV4Scope | null;
  className?: string;
}) {
  if (!scripts) {
    return null;
  }

  const variants = [
    { key: "A", ...scripts.variantA },
    { key: "B", ...scripts.variantB },
  ] as const;

  return (
    <details className={cn("rounded-2xl bg-white/80 px-3 py-3 text-sm text-slate-700 ring-1 ring-emerald-100", className)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold text-emerald-800">
        <span className="inline-flex items-center gap-2">
          <MessagesSquare className="h-3.5 w-3.5" aria-hidden="true" />
          A/B 话术
        </span>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-900 ring-1 ring-emerald-100">
          推荐 {scripts.recommendation}
        </span>
      </summary>
      <p className="mt-2 text-xs leading-5 text-slate-500">{scripts.reason}</p>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {variants.map((variant) => (
          <div key={variant.key} className="rounded-xl bg-emerald-50/60 px-3 py-2">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-emerald-900">{variant.key} · {variant.label}</p>
              <CopyScriptButton
                text={variant.message}
                variantKey={variant.key}
                tone={variant.key === "A" ? "trust_building" : "closing_soft"}
                scope={scope}
              />
            </div>
            <p className="whitespace-pre-line text-xs leading-5 text-slate-700">{variant.message}</p>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">适合：{variant.bestFor}</p>
          </div>
        ))}
      </div>
    </details>
  );
}
