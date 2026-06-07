"use client";

import * as React from "react";
import type { ChatMode } from "../types";

interface EmptyStateProps {
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
}

export function EmptyState({ mode, onModeChange }: EmptyStateProps) {
  void mode;
  void onModeChange;

  return (
    <div className="flex min-h-[360px] flex-1 items-center justify-center px-8 text-center">
      <div className="max-w-[260px] text-slate-400">
        <p className="text-sm font-semibold text-slate-500">使用快速模式开始对话</p>
        <p className="mt-2 text-xs leading-5">你可以直接提问，或选择下方快捷分类后补充问题。</p>
      </div>
    </div>
  );
}
