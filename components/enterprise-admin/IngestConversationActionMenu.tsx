"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function IngestConversationActionMenu({
  onRename,
  onDelete
}: {
  onRename: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        aria-label="对话记录更多操作"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        className="flex h-7 w-7 items-center justify-center rounded-full text-[#9a9a96] transition hover:bg-white hover:text-[#202020]"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>

      {open ? (
        <div className="absolute right-0 top-8 z-30 w-32 overflow-hidden rounded-2xl border border-[#e7e7e4] bg-white p-1 text-xs font-semibold text-[#404040] shadow-[0_18px_48px_rgba(15,23,42,0.14)]">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setOpen(false);
              onRename();
            }}
            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition hover:bg-[#f6f6f5]"
          >
            <Pencil className="h-3.5 w-3.5 text-[#777]" aria-hidden="true" />
            编辑名称
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setOpen(false);
              onDelete();
            }}
            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[#b42318] transition hover:bg-[#fff1f0]"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            删除
          </button>
        </div>
      ) : null}
    </div>
  );
}
