"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Sparkles } from "lucide-react";
import {
  DEFAULT_INGEST_MODEL_OPTION,
  getIngestModelOptionByLabel,
  INGEST_MODEL_OPTIONS,
  type IngestModelOption
} from "@/lib/enterprise/ingest-model-options";

interface IngestGPTModelPickerProps {
  selectedModel?: string;
  disabled?: boolean;
  onModelChange?: (selection: IngestModelOption) => void;
  onOpen?: () => void;
}

export function IngestGPTModelPicker({
  selectedModel = DEFAULT_INGEST_MODEL_OPTION.label,
  disabled = false,
  onModelChange,
  onOpen
}: IngestGPTModelPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const selectedSelection = useMemo(() => getIngestModelOptionByLabel(selectedModel), [selectedModel]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (pickerRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function commitSelection(next: IngestModelOption) {
    if (disabled) {
      return;
    }

    onModelChange?.(next);
    setIsOpen(false);
  }

  return (
    <div ref={pickerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          if (disabled) {
            return;
          }

          setIsOpen(!isOpen);
          onOpen?.();
        }}
        disabled={disabled}
        className="inline-flex h-9 max-w-[220px] items-center gap-1.5 rounded-full bg-[#f6f6f5] px-3 text-xs font-semibold text-[#303030] transition hover:bg-[#ededeb] disabled:cursor-not-allowed disabled:text-[#aaa]"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="选择投喂大模型"
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#315bf6]" aria-hidden="true" />
        <span className="truncate">{selectedSelection.label}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#666]" aria-hidden="true" />
      </button>
      {isOpen ? (
        <div className="absolute bottom-11 left-0 z-40 w-[320px] max-w-[calc(100vw-2rem)] rounded-2xl border border-[#e7e7e4] bg-white p-2 text-xs text-[#303030] shadow-[0_18px_50px_rgba(15,23,42,0.14)]">
          <div className="mb-2 px-2 py-1">
            <p className="font-semibold text-[#202020]">选择当前投喂大模型</p>
            <p className="mt-1 text-[11px] leading-4 text-[#8a8a85]">投喂端只是 IDE，回复由当前选择的真实模型生成。</p>
          </div>
          <div className="space-y-1">
            {INGEST_MODEL_OPTIONS.map((option) => {
              const isSelected = selectedSelection.provider === option.provider;

              return (
                <button
                  key={option.provider}
                  type="button"
                  onClick={() => commitSelection(option)}
                  className={[
                    "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-[#f5f5f3]",
                    isSelected ? "bg-[#f7f7f5]" : ""
                  ].join(" ")}
                >
                  <span className={[
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                    option.provider === "openai" ? "bg-[#edf2ff] text-[#315bf6]" : "bg-[#ebfff4] text-[#128246]"
                  ].join(" ")}>
                    {option.provider === "openai" ? "AI" : "DS"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[#202020]">{option.label}</span>
                      {isSelected ? <Check className="h-3.5 w-3.5 shrink-0 text-[#128246]" aria-hidden="true" /> : null}
                    </span>
                    <span className="mt-1 block text-[11px] font-semibold text-[#666]">Provider：{option.provider === "openai" ? "OpenAI" : "DeepSeek"} · {option.depthLabel} · {option.speedLabel}</span>
                    <span className="mt-1 block leading-4 text-[#777]">{option.description}</span>
                    <span className="mt-1 block text-[11px] text-[#999]">适合：{option.scenario}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
