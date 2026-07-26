"use client";

import { LoaderCircle, MessageSquareText, Pin } from "lucide-react";
import { IngestConversationActionMenu } from "@/components/enterprise-admin/IngestConversationActionMenu";
import type {
  AdminIngestConversationRuntimeStatus
} from "@/lib/enterprise/admin-ingest-conversation-runtime-status";
import type { IngestAgentConversation } from "@/lib/enterprise/mock-agent-conversations";
import type { KeyboardEvent } from "react";

export function IngestAgentConversationItem({
  conversation,
  runtimeStatus,
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
  runtimeStatus?: AdminIngestConversationRuntimeStatus;
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
        {runtimeStatus?.state === "generating" ? (
          <span className="mt-0.5 flex items-center gap-1 text-[10px] font-normal text-[#3b8df5]">
            <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />
            生成中
          </span>
        ) : (
          <span className="mt-0.5 block truncate text-[10px] text-[#999]">
            {conversation.updatedLabel} · {conversation.messageCount} 条
          </span>
        )}
      </span>
      {runtimeStatus?.state === "completed_unread" ? (
        <span
          aria-label="生成完成，尚未查看"
          className="h-2 w-2 shrink-0 rounded-full bg-[#3b8df5] shadow-[0_0_0_3px_rgba(59,141,245,0.12)]"
        />
      ) : null}
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
