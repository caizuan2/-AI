"use client";

import { IngestAgentConversationItem } from "@/components/enterprise-admin/IngestAgentConversationItem";
import { IngestConversationDeleteDialog } from "@/components/enterprise-admin/IngestConversationDeleteDialog";
import { IngestConversationRenameDialog } from "@/components/enterprise-admin/IngestConversationRenameDialog";
import type { IngestAgentConversation } from "@/lib/enterprise/mock-agent-conversations";
import { useState } from "react";

export function IngestAgentConversationList({
  agentId,
  conversations,
  activeConversationId,
  expandedAll,
  onSelectConversation,
  onToggleExpandedAll,
  onShareConversation,
  onStartGroupChat,
  onRenameConversation,
  onTogglePinConversation,
  onToggleArchiveConversation,
  onDeleteConversation
}: {
  agentId: string;
  conversations: IngestAgentConversation[];
  activeConversationId?: string;
  expandedAll: boolean;
  onSelectConversation: (agentId: string, conversationId: string) => void;
  onToggleExpandedAll: (agentId: string) => void;
  onShareConversation?: (agentId: string, conversationId: string) => void;
  onStartGroupChat?: (agentId: string, conversationId: string) => void;
  onRenameConversation: (agentId: string, conversationId: string, title: string) => void;
  onTogglePinConversation?: (agentId: string, conversationId: string) => void;
  onToggleArchiveConversation?: (agentId: string, conversationId: string) => void;
  onDeleteConversation: (agentId: string, conversationId: string) => void;
}) {
  const [renameTarget, setRenameTarget] = useState<IngestAgentConversation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IngestAgentConversation | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const supportsConversationState = Boolean(onTogglePinConversation || onToggleArchiveConversation);
  const activeConversations = [...(supportsConversationState
    ? conversations.filter((conversation) => conversation.status !== "archived")
    : conversations
  )].sort((left, right) => {
    const pinDifference = Number(right.pinned === true) - Number(left.pinned === true);

    if (pinDifference !== 0) {
      return pinDifference;
    }

    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  });
  const archivedConversations = supportsConversationState
    ? conversations.filter((conversation) => conversation.status === "archived")
    : [];
  const visibleConversations = expandedAll ? activeConversations : activeConversations.slice(0, 3);
  const hasMore = activeConversations.length > 3;

  return (
    <div className="mb-1 mt-1 rounded-2xl border border-orange-100 bg-gradient-to-b from-[#fffaf3] via-[#fffdf9] to-[#f7f4ef] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
      {activeConversations.length === 0 ? (
        <p className="px-2.5 py-2 text-xs leading-5 text-[#8a8a86]">暂无对话，可在更多菜单中新建对话。</p>
      ) : (
        <div className="space-y-1">
          {visibleConversations.map((conversation) => (
            <IngestAgentConversationItem
              key={conversation.id}
              conversation={conversation}
              active={conversation.id === activeConversationId}
              onSelect={(conversationId) => onSelectConversation(agentId, conversationId)}
              onShare={onShareConversation ? (target) => onShareConversation(agentId, target.id) : undefined}
              onStartGroupChat={onStartGroupChat ? (target) => onStartGroupChat(agentId, target.id) : undefined}
              onRename={setRenameTarget}
              onTogglePin={onTogglePinConversation ? (target) => onTogglePinConversation(agentId, target.id) : undefined}
              onToggleArchive={onToggleArchiveConversation ? (target) => onToggleArchiveConversation(agentId, target.id) : undefined}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      {hasMore ? (
        <button
          type="button"
          onClick={() => onToggleExpandedAll(agentId)}
          className="mt-1 flex h-7 w-full items-center justify-center rounded-xl text-[11px] font-semibold text-[#777] transition hover:bg-white hover:text-[#202020]"
        >
          {expandedAll ? "收起" : `展开更多 ${activeConversations.length - 3} 条`}
        </button>
      ) : null}

      {archivedConversations.length > 0 ? (
        <div className="mt-1 border-t border-orange-100 pt-1">
          <button
            type="button"
            onClick={() => setShowArchived((current) => !current)}
            className="flex h-7 w-full items-center justify-center rounded-xl text-[11px] font-semibold text-[#888] transition hover:bg-white hover:text-[#202020]"
          >
            {showArchived ? "收起已归档对话" : `已归档对话 ${archivedConversations.length} 条`}
          </button>
          {showArchived ? (
            <div className="mt-1 space-y-1">
              {archivedConversations.map((conversation) => (
                <IngestAgentConversationItem
                  key={conversation.id}
                  conversation={conversation}
                  active={false}
                  onSelect={() => undefined}
                  onShare={onShareConversation ? (target) => onShareConversation(agentId, target.id) : undefined}
                  onStartGroupChat={onStartGroupChat ? (target) => onStartGroupChat(agentId, target.id) : undefined}
                  onRename={setRenameTarget}
                  onToggleArchive={onToggleArchiveConversation ? (target) => onToggleArchiveConversation(agentId, target.id) : undefined}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <IngestConversationRenameDialog
        open={Boolean(renameTarget)}
        title={renameTarget?.title ?? ""}
        onCancel={() => setRenameTarget(null)}
        onSave={(nextTitle) => {
          if (renameTarget) {
            onRenameConversation(agentId, renameTarget.id, nextTitle);
          }
          setRenameTarget(null);
        }}
      />
      <IngestConversationDeleteDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget?.title ?? ""}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            onDeleteConversation(agentId, deleteTarget.id);
          }
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}
