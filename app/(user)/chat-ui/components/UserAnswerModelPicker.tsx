"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  USER_ANSWER_MODEL_OPTIONS,
  getUserAnswerModelOption,
  type UserAnswerModelProvider
} from "@/lib/ai-chat/user-answer-model";

interface UserAnswerModelPickerProps {
  value: UserAnswerModelProvider;
  disabled?: boolean;
  onChange: (provider: UserAnswerModelProvider) => void;
}

export function UserAnswerModelMenu({
  value,
  onSelect
}: {
  value: UserAnswerModelProvider;
  onSelect: (provider: UserAnswerModelProvider) => void;
}) {
  return (
    <div className="space-y-1">
      {USER_ANSWER_MODEL_OPTIONS.map((option) => {
        const active = option.provider === value;

        return (
          <button
            key={option.provider}
            type="button"
            onClick={() => onSelect(option.provider)}
            className={cn(
              "focus-ring flex min-h-14 w-full touch-manipulation items-center gap-3 rounded-xl px-3 py-2 text-left transition active:scale-[0.99]",
              active ? "bg-slate-100" : "hover:bg-slate-50"
            )}
            aria-pressed={active}
          >
            <span
              className={cn(
                "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                option.provider === "doubao-pro"
                  ? "bg-orange-50 text-orange-600"
                  : "bg-emerald-50 text-emerald-700"
              )}
              aria-hidden="true"
            >
              {option.badge}
            </span>
            <span className="min-w-0 flex-1 text-sm font-semibold text-slate-900">
              {option.label}
            </span>
            {active ? (
              <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function UserAnswerModelPicker({
  value,
  disabled = false,
  onChange
}: UserAnswerModelPickerProps) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const selected = getUserAnswerModelOption(value);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (
        rootRef.current &&
        target instanceof Node &&
        !rootRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  React.useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "focus-ring inline-flex h-11 w-11 touch-manipulation items-center justify-center rounded-full border text-[11px] font-bold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60",
          selected.provider === "doubao-pro"
            ? "border-orange-100 bg-orange-50 text-orange-600 hover:bg-orange-100"
            : "border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
        )}
        aria-label={`选择回答大模型，当前为${selected.label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={selected.label}
      >
        {selected.badge}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="选择回答大模型"
          className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] z-50 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-300/60 sm:absolute sm:bottom-auto sm:left-auto sm:right-0 sm:top-12 sm:w-72"
        >
          <div className="px-2 pb-2 text-xs font-semibold text-slate-500">
            选择回答大模型
          </div>
          <UserAnswerModelMenu
            value={value}
            onSelect={(provider) => {
              onChange(provider);
              setOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
