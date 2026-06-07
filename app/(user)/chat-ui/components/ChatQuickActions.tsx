"use client";

import * as React from "react";
import { Camera, Images, Search, Sparkles, Upload, Video, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMode, ChatQuickActionItem } from "../types";

interface ChatQuickActionsProps {
  mode: ChatMode;
  enableDeepThinking: boolean;
  enableWebSearch: boolean;
  categoryLabels?: string[];
  quickActions?: ChatQuickActionItem[];
  onModeChange: (mode: ChatMode) => void;
  onToggleDeepThinking: () => void;
  onToggleWebSearch: () => void;
  onQuickAction?: (action: ChatQuickActionItem) => void;
}

type DefaultQuickAction = ChatQuickActionItem & { iconComponent: LucideIcon };

const defaultActions: DefaultQuickAction[] = [
  {
    id: "fast",
    label: "快速",
    iconComponent: Zap,
    kind: "mode",
    mode: "fast"
  },
  {
    id: "creative",
    label: "AI 创作",
    iconComponent: Sparkles,
    kind: "tool",
    prompt: "请帮我进行 AI 创作："
  },
  {
    id: "photo-motion",
    label: "照片动起来",
    iconComponent: Images,
    kind: "tool",
    prompt: "我想了解照片动起来功能："
  },
  {
    id: "video-call",
    label: "视频通话",
    iconComponent: Video,
    kind: "tool",
    prompt: "我想了解视频通话功能："
  }
];

function hasDefaultIcon(action: ChatQuickActionItem): action is DefaultQuickAction {
  return "iconComponent" in action;
}

function getActionIcon(action: ChatQuickActionItem): LucideIcon {
  const icon = action.icon?.toLowerCase();

  if (icon === "zap" || icon === "bolt") {
    return Zap;
  }

  if (icon === "image" || icon === "images" || icon === "photo") {
    return Images;
  }

  if (icon === "video") {
    return Video;
  }

  if (icon === "camera") {
    return Camera;
  }

  if (icon === "upload") {
    return Upload;
  }

  if (icon === "sparkles" || icon === "star") {
    return Sparkles;
  }

  if (action.mode === "fast" || action.label.includes("快速")) {
    return Zap;
  }

  if (action.label.includes("照片") || action.label.includes("图片")) {
    return Images;
  }

  if (action.label.includes("视频")) {
    return Video;
  }

  return Sparkles;
}

export function ChatQuickActions({
  mode,
  enableDeepThinking,
  enableWebSearch,
  categoryLabels = [],
  quickActions = [],
  onModeChange,
  onToggleDeepThinking,
  onToggleWebSearch,
  onQuickAction
}: ChatQuickActionsProps) {
  const categoryActions = quickActions.length > 0 ? quickActions : categoryLabels.map((label, index) => ({
    id: `category-${label}-${index}`,
    label,
    kind: "category" as const,
    prompt: label
  }));
  const visibleActions = categoryActions.length > 0 ? categoryActions : defaultActions;

  function handleAction(action: ChatQuickActionItem) {
    if (action.kind === "mode" && action.mode) {
      onModeChange(action.mode);
    }

    onQuickAction?.(action);
  }

  return (
    <div className="shrink-0 bg-white px-3 pt-2">
      <div
        className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="快捷功能"
      >
        {visibleActions.map((action) => {
          const Icon = hasDefaultIcon(action) ? action.iconComponent : getActionIcon(action);
          const active = action.kind === "mode" && action.mode === mode;

          return (
            <button
              key={action.id}
              type="button"
              onClick={() => handleAction(action)}
              className={cn(
                "focus-ring inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold shadow-sm transition",
                active
                  ? "border-slate-300 bg-slate-50 text-slate-950"
                  : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {action.label}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => onModeChange("expert")}
          className={cn(
            "focus-ring inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold shadow-sm transition",
            mode === "expert"
              ? "border-blue-200 bg-blue-50 text-blue-700"
              : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
          )}
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          专家
        </button>

        <button
          type="button"
          onClick={onToggleDeepThinking}
          className={cn(
            "focus-ring inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold shadow-sm transition",
            enableDeepThinking
              ? "border-blue-200 bg-blue-50 text-blue-700"
              : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
          )}
          aria-pressed={enableDeepThinking}
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          深度思考
        </button>

        <button
          type="button"
          onClick={onToggleWebSearch}
          className={cn(
            "focus-ring inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold shadow-sm transition",
            enableWebSearch
              ? "border-blue-200 bg-blue-50 text-blue-700"
              : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
          )}
          aria-pressed={enableWebSearch}
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          智能搜索
        </button>

      </div>
    </div>
  );
}
