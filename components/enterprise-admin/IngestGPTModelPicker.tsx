"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import {
  createGptModelSelection,
  DEFAULT_GPT_MODEL_SELECTION,
  getGptModelSelectionByDisplayName,
  GPT_MODEL_TIERS,
  GPT_MODEL_VERSIONS,
  type GptModelSelection,
  type GptTier,
  type GptVersion
} from "@/lib/enterprise/gpt-model-options";

interface IngestGPTModelPickerProps {
  selectedModel?: string;
  onModelChange?: (selection: GptModelSelection) => void;
  onOpen?: () => void;
}

export function IngestGPTModelPicker({
  selectedModel = DEFAULT_GPT_MODEL_SELECTION.displayName,
  onModelChange,
  onOpen
}: IngestGPTModelPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const selectedSelection = useMemo(() => getGptModelSelectionByDisplayName(selectedModel), [selectedModel]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeTier, setActiveTier] = useState<GptTier>(selectedSelection.tier);
  const [activeVersion, setActiveVersion] = useState<GptVersion>(selectedSelection.version);

  useEffect(() => {
    setActiveTier(selectedSelection.tier);
    setActiveVersion(selectedSelection.version);
  }, [selectedSelection.tier, selectedSelection.version]);

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

  function commitSelection(input: { tier?: GptTier; version?: GptVersion }) {
    const next = createGptModelSelection({
      tier: input.tier ?? activeTier,
      version: input.version ?? activeVersion
    });

    setActiveTier(next.tier);
    setActiveVersion(next.version);
    onModelChange?.(next);
    setIsOpen(false);
  }

  return (
    <div ref={pickerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setIsOpen((current) => !current);
          onOpen?.();
        }}
        className="inline-flex h-9 max-w-[220px] items-center gap-1.5 rounded-full bg-[#f6f6f5] px-3 text-xs font-semibold text-[#303030] transition hover:bg-[#ededeb]"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="选择 GPT 模型档位"
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#315bf6]" aria-hidden="true" />
        <span className="truncate">{selectedSelection.displayName}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#666]" aria-hidden="true" />
      </button>
      {isOpen ? (
        <div className="absolute bottom-11 left-0 z-40 flex max-w-[calc(100vw-2rem)] gap-2 text-xs font-semibold text-[#303030]">
          <div className="w-40 rounded-2xl border border-[#e7e7e4] bg-white p-2 shadow-[0_18px_50px_rgba(15,23,42,0.14)]">
            <div className="space-y-1">
              {GPT_MODEL_TIERS.map((option) => {
                const isSelected = selectedSelection.tier === option.tier;

                return (
                  <button
                    key={option.tier}
                    type="button"
                    onMouseEnter={() => setActiveTier(option.tier)}
                    onFocus={() => setActiveTier(option.tier)}
                    onClick={() => commitSelection({ tier: option.tier })}
                    className={[
                      "flex h-9 w-full items-center justify-between rounded-xl px-3 text-left transition hover:bg-[#f5f5f3]",
                      activeTier === option.tier ? "bg-[#f7f7f5] text-[#202020]" : "text-[#444]",
                      isSelected ? "font-bold text-[#128246]" : ""
                    ].join(" ")}
                  >
                    <span>{option.label}</span>
                    {isSelected ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>
            <div className="my-1 border-t border-[#eeeeeb]" />
            <div className="flex h-9 items-center justify-between rounded-xl px-3 text-[#444]">
              <span>GPT-{activeVersion}</span>
              <ChevronRight className="h-3.5 w-3.5 text-[#777]" aria-hidden="true" />
            </div>
          </div>
          <div className="w-36 rounded-2xl border border-[#e7e7e4] bg-white p-2 shadow-[0_18px_50px_rgba(15,23,42,0.14)]">
            {GPT_MODEL_VERSIONS.map((option) => {
              const isSelected = selectedSelection.version === option.version;

              return (
                <button
                  key={option.version}
                  type="button"
                  onMouseEnter={() => setActiveVersion(option.version)}
                  onFocus={() => setActiveVersion(option.version)}
                  onClick={() => commitSelection({ version: option.version })}
                  className={[
                    "flex h-9 w-full items-center justify-between rounded-xl px-3 text-left transition hover:bg-[#f5f5f3]",
                    activeVersion === option.version ? "bg-[#f7f7f5] text-[#202020]" : "text-[#444]",
                    isSelected ? "font-bold text-[#128246]" : ""
                  ].join(" ")}
                >
                  <span>{option.version}</span>
                  {isSelected ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
