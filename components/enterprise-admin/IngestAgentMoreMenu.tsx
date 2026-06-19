"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, MessageSquarePlus, MoreHorizontal, Pin, PinOff, Trash2, type LucideIcon } from "lucide-react";
import type { IngestChatAgent } from "@/lib/enterprise/mock-chat";

export function IngestAgentMoreMenu({
  agent,
  isPinned = false,
  onCreateConversation,
  onTogglePinned,
  onViewDetails,
  onDelete
}: {
  agent: Pick<IngestChatAgent, "id" | "editableByIngestAdmin" | "deletableByIngestAdmin" | "managedBySuperAdmin">;
  isPinned?: boolean;
  onCreateConversation?: (agentId: string) => void;
  onTogglePinned?: (agentId: string) => void;
  onViewDetails: (agentId: string) => void;
  onDelete: (agentId: string) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }

      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function run(action: (agentId: string) => void) {
    setOpen(false);
    action(agent.id);
  }

  return (
    <div ref={menuRef} className="relative shrink-0" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        aria-label="Agent 更多操作"
        onClick={() => setOpen((current) => !current)}
        className="flex h-7 w-7 items-center justify-center rounded-full text-[#8a8a86] transition hover:bg-white hover:text-[#202020]"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {open ? (
        <div className="absolute right-0 top-8 z-[90] w-48 rounded-2xl border border-[#e7e7e4] bg-white p-2 text-xs font-semibold shadow-[0_18px_50px_rgba(15,23,42,0.16)]">
          <MenuItem icon={MessageSquarePlus} label="新建对话" onClick={() => run((agentId) => onCreateConversation?.(agentId))} />
          <MenuItem icon={Eye} label="Agent 详情" onClick={() => run(onViewDetails)} />
          <MenuItem
            icon={isPinned ? PinOff : Pin}
            label={isPinned ? "取消置顶" : "置顶"}
            onClick={() => run((agentId) => onTogglePinned?.(agentId))}
          />
          <MenuItem icon={Trash2} label="删除" onClick={() => run(onDelete)} danger={agent.deletableByIngestAdmin === true} muted={agent.deletableByIngestAdmin !== true} />
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger = false,
  muted = false
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  danger?: boolean;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex h-9 w-full items-center gap-2 rounded-xl px-3 text-left transition hover:bg-[#f5f5f3]",
        danger ? "text-[#b93b4a]" : muted ? "text-[#999]" : "text-[#444]"
      ].join(" ")}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}
