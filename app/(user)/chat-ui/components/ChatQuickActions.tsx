"use client";

import * as React from "react";
import {
  BookOpen,
  Brain,
  Camera,
  ClipboardList,
  MessageSquareText,
  Search,
  Sparkles,
  Target,
  Upload
} from "lucide-react";
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
    id: "business-problem",
    label: "业务问题",
    iconComponent: Target,
    kind: "mode",
    mode: "fast"
  },
  {
    id: "customer-dialog",
    label: "客户对话",
    iconComponent: MessageSquareText,
    kind: "tool",
    prompt: "请分析这段客户对话，判断客户意图并生成可直接复制的回复话术："
  },
  {
    id: "knowledge-rag",
    label: "小董AI大脑🧠检索",
    iconComponent: BookOpen,
    kind: "tool",
    prompt: "请基于小董AI大脑🧠回答这个业务问题，并列出引用来源："
  },
  {
    id: "deal-plan",
    label: "成交建议",
    iconComponent: ClipboardList,
    kind: "tool",
    prompt: "请根据当前客户状态给出成交路径、标准回复话术和下一步行动："
  }
];

function hasDefaultIcon(action: ChatQuickActionItem): action is DefaultQuickAction {
  return "iconComponent" in action;
}

function getActionIcon(action: ChatQuickActionItem): LucideIcon {
  const icon = action.icon?.toLowerCase();

  if (icon === "target" || icon === "zap" || icon === "bolt") {
    return Target;
  }

  if (icon === "book" || icon === "bookopen" || icon === "knowledge") {
    return BookOpen;
  }

  if (icon === "message" || icon === "chat") {
    return MessageSquareText;
  }

  if (icon === "clipboard" || icon === "list") {
    return ClipboardList;
  }

  if (icon === "brain") {
    return Brain;
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

  if (action.mode === "fast" || action.label.includes("业务") || action.label.includes("快速")) {
    return Target;
  }

  if (action.label.includes("客户") || action.label.includes("对话") || action.label.includes("话术")) {
    return MessageSquareText;
  }

  if (action.label.includes("知识") || action.label.includes("大脑") || action.label.toLowerCase().includes("rag")) {
    return BookOpen;
  }

  if (action.label.includes("成交") || action.label.includes("下一步") || action.label.includes("方案")) {
    return ClipboardList;
  }

  if (action.label.includes("截图") || action.label.includes("图片")) {
    return Upload;
  }

  if (action.label.includes("思考")) {
    return Brain;
  }

  return Sparkles;
}

function normalizeBusinessAction(action: ChatQuickActionItem): ChatQuickActionItem {
  const label = action.label.trim();

  if (label === "快速") {
    return {
      ...action,
      label: "业务问题",
      prompt: null,
      kind: "mode",
      mode: "fast",
      icon: "target"
    };
  }

  if (/创作/i.test(label)) {
    return {
      ...action,
      label: "回复话术",
      prompt: "请根据客户对话生成可直接复制的回复话术，并给出下一步引导：",
      icon: "message"
    };
  }

  if (label.includes("图片") || label.includes("照片")) {
    return {
      ...action,
      label: "客户截图分析",
      prompt: "我会上传客户对话截图，请识别关键信息并生成业务处理方案：",
      icon: "upload"
    };
  }

  if (label.includes("视频")) {
    return {
      ...action,
      label: "成交路径",
      prompt: "请把当前客户情况拆成成交路径、标准回复话术和跟进动作：",
      icon: "clipboard"
    };
  }

  return action;
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
  const visibleActions = (categoryActions.length > 0 ? categoryActions : defaultActions)
    .map(normalizeBusinessAction);

  function handleAction(action: ChatQuickActionItem) {
    if (action.kind === "mode" && action.mode) {
      onModeChange(action.mode);
    }

    onQuickAction?.(action);
  }

  function handleStandaloneAction(action: ChatQuickActionItem, callback: () => void) {
    callback();
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
          onClick={() => handleStandaloneAction({
            id: "expert-review",
            label: "专家研判",
            kind: "mode",
            mode: "expert"
          }, () => onModeChange("expert"))}
          className={cn(
            "focus-ring inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold shadow-sm transition",
            mode === "expert"
              ? "border-blue-200 bg-blue-50 text-blue-700"
              : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
          )}
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          专家研判
        </button>

        <button
          type="button"
          onClick={() => handleStandaloneAction({
            id: "deep-thinking",
            label: "深度思考",
            kind: "tool"
          }, onToggleDeepThinking)}
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
          onClick={() => handleStandaloneAction({
            id: "brain-search",
            label: "大脑搜索",
            kind: "tool"
          }, onToggleWebSearch)}
          className={cn(
            "focus-ring inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold shadow-sm transition",
            enableWebSearch
              ? "border-blue-200 bg-blue-50 text-blue-700"
              : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
          )}
          aria-pressed={enableWebSearch}
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          大脑搜索
        </button>

      </div>
    </div>
  );
}
