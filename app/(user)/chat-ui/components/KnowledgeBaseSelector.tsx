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
      className="focus-ring relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-950 text-[13px] font-extrabold text-white shadow-sm transition hover:bg-slate-800"
      aria-label={activeTitle ? `当前知识库：${activeTitle}` : "选择专家知识库"}
      title={activeTitle ? `当前知识库：${activeTitle}` : "选择专家知识库"}
    >
      <span aria-hidden="true">沟</span>
      {selectedCount > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold leading-4 text-white ring-2 ring-white">
          {selectedCount}
        </span>
      ) : null}
    </button>
  );
}
