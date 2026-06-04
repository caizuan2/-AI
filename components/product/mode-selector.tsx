"use client";

import type { RetrievalMode } from "@/lib/mock/product-ui";
import { retrievalModes } from "@/lib/mock/product-ui";
import { cn } from "@/lib/utils";

export function ModeSelector({
  value,
  onChange
}: {
  value: RetrievalMode;
  onChange: (value: RetrievalMode) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {retrievalModes.map((mode) => {
        const active = value === mode.value;

        return (
          <button
            key={mode.value}
            type="button"
            onClick={() => onChange(mode.value)}
            className={cn(
              "focus-ring rounded-lg border px-3 py-3 text-left transition",
              active
                ? "border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-500/40 dark:bg-indigo-500/15 dark:text-indigo-100"
                : "border-line bg-white text-ink hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            )}
          >
            <span className="block text-sm font-semibold">{mode.label}</span>
            <span className="mt-1 block text-xs leading-5 text-muted dark:text-slate-400">{mode.description}</span>
          </button>
        );
      })}
    </div>
  );
}
