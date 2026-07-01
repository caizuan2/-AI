"use client";

import { Signal } from "lucide-react";
import { cn } from "@/lib/utils";

interface DealSignal {
  key: string;
  label: string;
  confidence: number;
  evidence: string;
}

export function DealSignalPanel({
  signals,
  className,
}: {
  signals?: DealSignal[] | null;
  className?: string;
}) {
  const items = (signals ?? []).slice(0, 3);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className={cn("rounded-2xl bg-white/70 px-3 py-3 ring-1 ring-emerald-100", className)}>
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-emerald-800">
        <Signal className="h-3.5 w-3.5" aria-hidden="true" />
        成交信号
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((signal) => (
          <span
            key={signal.key}
            className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-900 ring-1 ring-emerald-100"
            title={signal.evidence}
          >
            {signal.label}
          </span>
        ))}
      </div>
    </div>
  );
}
