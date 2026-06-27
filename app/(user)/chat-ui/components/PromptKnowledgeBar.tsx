"use client";

import * as React from "react";
import type { SelectedKnowledgeBase } from "../types";

interface PromptKnowledgeBarProps {
  items: SelectedKnowledgeBase[];
  onActivate: (kbId: string) => void;
}

export function PromptKnowledgeBar({
  items,
  onActivate
}: PromptKnowledgeBarProps) {
  const orderedItems = React.useMemo(() => [
    ...items.filter((item) => item.active),
    ...items.filter((item) => !item.active)
  ], [items]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="shrink-0 bg-white px-3 pt-2">
      <div className="flex w-full justify-start gap-2 overflow-x-auto px-1 pb-1 text-left text-xs">
        {orderedItems.map((item) => (
          <button
            type="button"
            key={item.kb_id}
            onClick={() => onActivate(item.kb_id)}
            aria-pressed={item.active}
            className={[
              "focus-ring inline-flex h-8 max-w-[280px] shrink-0 items-center truncate rounded-full border px-3 py-1.5 font-semibold transition",
              item.active
                ? "border-slate-950 bg-slate-950 text-white shadow-sm"
                : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-white"
            ].join(" ")}
            title={item.expertName ? `${item.expertName} / ${item.title}` : item.title}
          >
            <span className="min-w-0 truncate">{item.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
