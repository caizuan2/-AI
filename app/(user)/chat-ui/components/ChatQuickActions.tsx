"use client";

import * as React from "react";
import {
  Brain,
  Camera,
  ClipboardList,
  MessageSquareText,
  Search,
  Sparkles,
  Target
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CHAT_MODE_CONFIGS,
  CHAT_MODE_ORDER,
  type FinalChatModeDecision,
  type ChatModeKey
} from "../lib/intent-mode-router";
import type { ChatMode, ChatQuickActionItem } from "../types";

const SHOW_DEBUG_MODE_PICKER = process.env.NEXT_PUBLIC_AI_DEBUG === "true";

interface ChatQuickActionsProps {
  decision?: FinalChatModeDecision;
  manualMode?: ChatModeKey | null;
  onToggleManualMode?: (mode: ChatModeKey) => void;
  mode?: ChatMode;
  enableDeepThinking?: boolean;
  enableWebSearch?: boolean;
  categoryLabels?: string[];
  quickActions?: ChatQuickActionItem[];
  onModeChange?: (mode: ChatMode) => void;
  onToggleDeepThinking?: () => void;
  onToggleWebSearch?: () => void;
  onQuickAction?: (action: ChatQuickActionItem) => void;
}

const modeIcons: Record<ChatModeKey, LucideIcon> = {
  business_problem: Target,
  reply_script: MessageSquareText,
  screenshot_analysis: Camera,
  conversion_path: ClipboardList,
  expert_review: Sparkles,
  deep_thinking: Brain,
  brain_search: Search
};

export function ChatQuickActions({
  decision,
  onToggleManualMode
}: ChatQuickActionsProps) {
  const [panelOpen, setPanelOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const activeDecision = decision ?? {
    mode: CHAT_MODE_CONFIGS.business_problem,
    source: "rules" as const,
    confidence: 0.5,
    reason: "未提供智能模式上下文，使用业务问题默认模式。",
    alternatives: [],
    lockedByUser: false,
    classifierVersion: "ai-knowledge-os-v13-local"
  };

  React.useEffect(() => {
    if (!panelOpen) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target;

      if (target instanceof Node && rootRef.current?.contains(target)) {
        return;
      }

      setPanelOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPanelOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [panelOpen]);

  function handleModeClick(modeKey: ChatModeKey) {
    onToggleManualMode?.(modeKey);
    setPanelOpen(false);
  }

  if (!SHOW_DEBUG_MODE_PICKER) {
    return null;
  }

  return (
    <div ref={rootRef} className="relative z-30 shrink-0 bg-white px-3 pt-2">
      <div className="flex items-center">
        <button
          type="button"
          className="focus-ring inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
          aria-expanded={panelOpen}
          aria-label="打开开发调试模式选择"
          onClick={() => setPanelOpen((open) => !open)}
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          开发调试：模式选择
        </button>
      </div>

      {panelOpen ? (
        <div className="absolute inset-x-3 bottom-[calc(100%-0.5rem)] z-40 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-300/40">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CHAT_MODE_ORDER.map((modeKey) => {
              const config = CHAT_MODE_CONFIGS[modeKey];
              const Icon = modeIcons[modeKey];
              const active = activeDecision.mode.key === modeKey;

              return (
                <button
                  key={modeKey}
                  type="button"
                  onClick={() => handleModeClick(modeKey)}
                  className={cn(
                    "focus-ring flex min-h-14 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition",
                    active
                      ? "border-slate-950 bg-slate-950 text-white"
                      : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                  )}
                  aria-pressed={active}
                  title={`选择${config.label}`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{config.label}</span>
                  {active ? (
                    <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold">已选</span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <p className="px-2 pt-2 text-xs font-medium text-slate-400">
            小董AI会自动判断，也可以手动指定处理方式。
          </p>
        </div>
      ) : null}
    </div>
  );
}
