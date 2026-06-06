"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { ModeToggle } from "./ModeToggle";
import type { ChatMode } from "../types";

interface EmptyStateProps {
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
}

export function EmptyState({ mode, onModeChange }: EmptyStateProps) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-5 py-12 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
        <Sparkles className="h-8 w-8" aria-hidden="true" />
      </div>
      <h1 className="text-2xl font-semibold text-slate-950 sm:text-3xl">AI 知识库助手</h1>
      <p className="mt-3 max-w-lg text-sm leading-6 text-slate-500">
        使用快速模式开始对话，也可以切换专家模式做更深度的知识库检索和分析。
      </p>

      <div className="mt-6 w-full max-w-sm">
        <ModeToggle mode={mode} onChange={onModeChange} compact />
      </div>

      <div className="mt-6 grid w-full gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm">
          <p className="text-sm font-semibold text-slate-900">快速模式</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">适合日常对话，即时响应，优先给出简洁答案。</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm">
          <p className="text-sm font-semibold text-slate-900">专家模式</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">适合复杂问题，更深度检索和分析知识库资料。</p>
        </div>
      </div>

      <p className="mt-6 text-xs text-slate-400">你可以直接提问；上传、语音、相机入口本轮仅作为占位。</p>
    </div>
  );
}
