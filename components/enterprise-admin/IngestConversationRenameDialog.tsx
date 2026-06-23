"use client";

import { useEffect, useState } from "react";

export function IngestConversationRenameDialog({
  open,
  title,
  onCancel,
  onSave
}: {
  open: boolean;
  title: string;
  onCancel: () => void;
  onSave: (nextTitle: string) => void;
}) {
  const [value, setValue] = useState(title);

  useEffect(() => {
    if (open) {
      setValue(title);
    }
  }, [open, title]);

  if (!open) {
    return null;
  }

  const trimmed = value.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4" onMouseDown={onCancel}>
      <div className="w-full max-w-[360px] rounded-[24px] border border-[#e7e7e4] bg-white p-4 shadow-[0_24px_90px_rgba(15,23,42,0.18)]" onMouseDown={(event) => event.stopPropagation()}>
        <p className="text-sm font-semibold text-[#202020]">编辑对话名称</p>
        <input
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              onCancel();
            }
            if (event.key === "Enter" && trimmed) {
              onSave(trimmed);
            }
          }}
          className="mt-3 h-11 w-full rounded-2xl border border-[#e4e4e1] bg-[#fbfbfa] px-3 text-sm font-medium text-[#202020] outline-none transition focus:border-orange-200 focus:bg-white focus:ring-4 focus:ring-orange-100"
          placeholder="输入对话名称"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="h-9 rounded-full bg-[#f3f3f1] px-4 text-xs font-semibold text-[#555] transition hover:bg-[#ededeb]">
            取消
          </button>
          <button
            type="button"
            disabled={!trimmed}
            onClick={() => onSave(trimmed)}
            className="h-9 rounded-full bg-[#202020] px-4 text-xs font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#d8d8d4]"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
