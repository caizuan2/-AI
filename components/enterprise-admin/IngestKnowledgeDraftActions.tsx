"use client";

import { Copy, Eye, Loader2, Pencil, Plug, RefreshCw, Save } from "lucide-react";

export function IngestKnowledgeDraftActions({
  isSaving,
  isSaved,
  isParsing,
  onCopy,
  onOpenDraft,
  onSave,
  onRegenerate,
  onContinueOptimize,
  onReconnectGpt
}: {
  isSaving: boolean;
  isSaved: boolean;
  isParsing: boolean;
  onCopy: () => void;
  onOpenDraft: () => void;
  onSave: () => void;
  onRegenerate: () => void;
  onContinueOptimize: () => void;
  onReconnectGpt?: () => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" onClick={onCopy} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-semibold text-[#555] shadow-sm transition hover:bg-[#f3f3f1]">
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        复制
      </button>
      <button type="button" onClick={onOpenDraft} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#202020] px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-black">
        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        查看结构化结果
      </button>
      <button type="button" onClick={onSave} disabled={isSaving || isSaved} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#e9f8ef] px-3 text-xs font-semibold text-[#128246] shadow-sm transition hover:bg-[#ddf4e7] disabled:bg-[#f0f0ee] disabled:text-[#aaa]">
        {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Save className="h-3.5 w-3.5" aria-hidden="true" />}
        {isSaved ? "已保存" : "保存知识入库"}
      </button>
      <button type="button" onClick={onRegenerate} disabled={isParsing} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-semibold text-[#555] shadow-sm transition hover:bg-[#f3f3f1] disabled:text-[#aaa]">
        <RefreshCw className={isParsing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} aria-hidden="true" />
        {isParsing ? "生成中..." : "重新生成"}
      </button>
      <button type="button" onClick={onContinueOptimize} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-semibold text-[#555] shadow-sm transition hover:bg-[#f3f3f1]">
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        继续优化
      </button>
      {onReconnectGpt ? (
        <button type="button" onClick={onReconnectGpt} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-semibold text-[#777] shadow-sm transition hover:bg-[#f3f3f1]">
          <Plug className="h-3.5 w-3.5" aria-hidden="true" />
          重新连接 GPT
        </button>
      ) : null}
    </div>
  );
}
