"use client";

import * as React from "react";

interface KnowledgeBaseSelectorProps {
  selectedCount: number;
  activeTitle?: string | null;
  onOpen: () => void;
}

export function KnowledgeBaseSelector({
  selectedCount,
  activeTitle,
  onOpen
}: KnowledgeBaseSelectorProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="focus-ring pointer-events-auto relative z-10 inline-flex h-12 w-12 shrink-0 touch-manipulation select-none items-center justify-center rounded-full text-white transition"
      aria-label={activeTitle ? `当前知识库：${activeTitle}` : "选择专家知识库"}
      aria-haspopup="dialog"
      title={activeTitle ? `当前知识库：${activeTitle}` : "选择专家知识库"}
    >
      <span aria-hidden="true" className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-[12px] font-extrabold shadow-sm transition hover:bg-slate-800">
        沟
      </span>
      {selectedCount > 0 ? (
        <span className="absolute right-0 top-0 inline-flex min-w-3.5 items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-bold leading-3.5 text-white ring-2 ring-white">
          {selectedCount}
        </span>
      ) : null}
    </button>
  );
}
