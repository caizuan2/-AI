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
  compact?: boolean;
  align?: "left" | "right";
  unavailableProviders?: string[];
  onCheckUnavailableProvider?: (provider: IngestModelOption["provider"]) => void;
}

const PRIMARY_INGEST_MODEL_PROVIDERS = new Set(["deepseek-pro", "doubao-pro"]);

function getProviderPresentation(provider: IngestModelOption["provider"]) {
  if (provider === "doubao-pro") {
    return {
      badge: "豆",
      badgeClassName: "bg-[#fff1e8] text-[#dc5b19]"
    };
  }

  if (provider === "openai") {
    return {
      badge: "AI",
      badgeClassName: "bg-[#edf2ff] text-[#315bf6]"
    };
  }

  if (provider === "qwen") {
    return {
      badge: "QW",
      badgeClassName: "bg-[#f3efff] text-[#7047c8]"
    };
  }

  if (provider === "kimi") {
    return {
      badge: "KM",
      badgeClassName: "bg-[#edf6ff] text-[#2468a9]"
    };
  }

  return {
    badge: "DS",
    badgeClassName: "bg-[#ebfff4] text-[#128246]"
  };
}

export function IngestGPTModelPicker({
  selectedModel = DEFAULT_INGEST_MODEL_OPTION.label,
  disabled = false,
  onModelChange,
  onOpen,
  compact = false,
  align = "left",
  unavailableProviders = [],
  onCheckUnavailableProvider
}: IngestGPTModelPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const selectedSelection = useMemo(() => getIngestModelOptionByLabel(selectedModel), [selectedModel]);
  const selectedProviderPresentation = useMemo(
    () => getProviderPresentation(selectedSelection.provider),
    [selectedSelection.provider]
  );
  const visibleModelOptions = useMemo(() => compact
    ? INGEST_MODEL_OPTIONS.filter((option) => PRIMARY_INGEST_MODEL_PROVIDERS.has(option.provider))
    : INGEST_MODEL_OPTIONS, [compact]);
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
        className={[
          "inline-flex h-9 items-center justify-center rounded-full text-xs font-semibold transition hover:bg-[#ededeb] disabled:cursor-not-allowed disabled:text-[#aaa]",
          compact ? "relative w-9 bg-transparent px-0" : "max-w-[220px] gap-1.5 bg-[#f6f6f5] px-3 text-[#303030]"
        ].join(" ")}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={`选择投喂大模型，当前 ${selectedSelection.label}`}
        title={`当前模型：${selectedSelection.label}`}
      >
        {compact ? (
          <>
            <span className={["flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold", selectedProviderPresentation.badgeClassName].join(" ")}>
              {selectedProviderPresentation.badge}
            </span>
            <ChevronDown className="absolute bottom-0.5 right-0 h-2.5 w-2.5 rounded-full bg-white text-[#666]" aria-hidden="true" />
          </>
        ) : (
          <>
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#315bf6]" aria-hidden="true" />
            <span className="truncate">{selectedSelection.label}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#666]" aria-hidden="true" />
          </>
        )}
      </button>
      {isOpen ? (
        <div className={[
          "z-40 max-h-[calc(100dvh-8rem)] overflow-y-auto overscroll-contain rounded-2xl border border-[#e7e7e4] bg-white p-2 text-xs text-[#303030] shadow-[0_18px_50px_rgba(15,23,42,0.14)]",
          compact
            ? "fixed inset-x-4 bottom-24 w-auto sm:absolute sm:inset-x-auto sm:bottom-11 sm:right-0 sm:w-[320px] sm:max-w-[calc(100vw-2rem)]"
            : `absolute bottom-11 w-[320px] max-w-[calc(100vw-2rem)] ${align === "right" ? "right-0" : "left-0"}`
        ].join(" ")}>
          <div className="mb-2 px-2 py-1">
            <p className="font-semibold text-[#202020]">选择当前投喂大模型</p>
          </div>
          <div className="space-y-1">
            {visibleModelOptions.map((option) => {
              const isSelected = selectedSelection.provider === option.provider;
              const isUnavailable = unavailableProviders.includes(option.provider);
              const providerPresentation = getProviderPresentation(option.provider);

              return (
                <button
                  key={option.provider}
                  type="button"
                  onClick={() => commitSelection(option)}
                  disabled={isUnavailable}
                  className={[
                    "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-[#f5f5f3] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
                    isSelected ? "bg-[#f7f7f5]" : ""
                  ].join(" ")}
                >
                  <span className={[
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                    providerPresentation.badgeClassName
                  ].join(" ")}>
                    {providerPresentation.badge}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[#202020]">{option.label}</span>
                      {isUnavailable
                        ? <span className="shrink-0 text-[10px] font-semibold text-[#999]">暂未连接</span>
                        : isSelected ? <Check className="h-3.5 w-3.5 shrink-0 text-[#128246]" aria-hidden="true" /> : null}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {unavailableProviders.includes("doubao-pro") && onCheckUnavailableProvider ? (
            <button
              type="button"
              onClick={() => onCheckUnavailableProvider("doubao-pro")}
              className="mt-2 w-full rounded-xl border border-[#ead8cf] bg-[#fff8f4] px-3 py-2 text-center text-xs font-semibold text-[#b44b16] transition hover:bg-[#fff1e8]"
            >
              检查豆包连接
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
