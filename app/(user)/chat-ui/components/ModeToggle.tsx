"use client";

import * as React from "react";
import { Zap, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMode } from "../types";

interface ModeToggleProps {
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
  compact?: boolean;
}

const options: Array<{
  value: ChatMode;
  label: string;
  icon: typeof Zap;
}> = [
  {
    value: "fast",
    label: "快速模式",
    icon: Zap
  },
  {
    value: "expert",
    label: "专家模式",
    icon: GraduationCap
  }
];

export function ModeToggle({ mode, onChange, compact = false }: ModeToggleProps) {
  return (
    <div
      className={cn(
        "inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm",
        compact ? "w-full max-w-xs" : ""
      )}
      role="tablist"
      aria-label="问答模式"
    >
      {options.map((option) => {
        const Icon = option.icon;
        const selected = mode === option.value;

        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "focus-ring inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold transition",
              selected
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
