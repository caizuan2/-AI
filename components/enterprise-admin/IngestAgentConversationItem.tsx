"use client";

import { MessageSquareText, Pin } from "lucide-react";
import { IngestConversationActionMenu } from "@/components/enterprise-admin/IngestConversationActionMenu";
import type { IngestAgentConversation } from "@/lib/enterprise/mock-agent-conversations";
import type { KeyboardEvent } from "react";

export function IngestAgentConversationItem({
  conversation,
  active,
  onSelect,
  onShare,
  onStartGroupChat,
  onRename,
  onTogglePin,
  onToggleArchive,
  onDelete
}: {
  conversation: IngestAgentConversation;
  active: boolean;
  onSelect: (conversationId: string) => void;
  onShare?: (conversation: IngestAgentConversation) => void;
  onStartGroupChat?: (conversation: IngestAgentConversation) => void;
  onRename: (conversation: IngestAgentConversation) => void;
  onTogglePin?: (conversation: IngestAgentConversation) => void;
  onToggleArchive?: (conversation: IngestAgentConversation) => void;
  onDelete: (conversation: IngestAgentConversation) => void;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(conversation.id);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(conversation.id)}
      onKeyDown={handleKeyDown}
      className={[
        "group flex min-h-9 w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition",
        active ? "bg-white text-[#202020] shadow-sm ring-1 ring-orange-100" : "text-[#666] hover:bg-white/70 hover:text-[#202020]"
      ].join(" ")}
    >
      {conversation.pinned && conversation.status !== "archived"
        ? <Pin className="h-3.5 w-3.5 shrink-0 text-[#d48a13]" aria-hidden="true" />
        : <MessageSquareText className="h-3.5 w-3.5 shrink-0 text-[#8a8a86]" aria-hidden="true" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold">{conversation.title}</span>
        <span className="mt-0.5 block truncate text-[10px] text-[#999]">
          {conversation.updatedLabel} · {conversation.messageCount} 条
        </span>
      </span>
      <IngestConversationActionMenu
        isPinned={conversation.pinned === true}
        isArchived={conversation.status === "archived"}
        onShare={onShare ? () => onShare(conversation) : undefined}
        onStartGroupChat={onStartGroupChat ? () => onStartGroupChat(conversation) : undefined}
        onRename={() => onRename(conversation)}
        onTogglePin={onTogglePin ? () => onTogglePin(conversation) : undefined}
        onToggleArchive={onToggleArchive ? () => onToggleArchive(conversation) : undefined}
        onDelete={() => onDelete(conversation)}
      />
    </div>
  );
}
