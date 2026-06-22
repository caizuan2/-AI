"use client";

import { Copy, Pencil } from "lucide-react";

export function IngestMessageQuickActions({
  onCopy,
  onEdit,
  tone = "dark"
}: {
  onCopy: () => void;
  onEdit: () => void;
  tone?: "dark" | "light";
}) {
  const buttonClass = tone === "dark"
    ? "inline-flex h-7 items-center gap-1 rounded-full bg-white/10 px-2.5 text-[11px] font-semibold text-white/80 transition hover:bg-white/15 hover:text-white"
    : "inline-flex h-7 items-center gap-1 rounded-full bg-[#f4f4f2] px-2.5 text-[11px] font-semibold text-[#666] transition hover:bg-[#ececea] hover:text-[#202020]";

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <button type="button" onClick={onCopy} className={buttonClass}>
        <Copy className="h-3 w-3" aria-hidden="true" />
        复制
      </button>
      <button type="button" onClick={onEdit} className={buttonClass}>
        <Pencil className="h-3 w-3" aria-hidden="true" />
        编辑
      </button>
    </div>
  );
}
