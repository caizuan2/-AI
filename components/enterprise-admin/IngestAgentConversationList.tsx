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
  onRenameConversation,
  onDeleteConversation
}: {
  agentId: string;
  conversations: IngestAgentConversation[];
  activeConversationId?: string;
  expandedAll: boolean;
  onSelectConversation: (agentId: string, conversationId: string) => void;
  onToggleExpandedAll: (agentId: string) => void;
  onRenameConversation: (agentId: string, conversationId: string, title: string) => void;
  onDeleteConversation: (agentId: string, conversationId: string) => void;
}) {
  const [renameTarget, setRenameTarget] = useState<IngestAgentConversation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IngestAgentConversation | null>(null);
  const visibleConversations = expandedAll ? conversations : conversations.slice(0, 3);
  const hasMore = conversations.length > 3;

  return (
    <div className="mb-1 mt-1 rounded-2xl border border-orange-100 bg-gradient-to-b from-[#fffaf3] via-[#fffdf9] to-[#f7f4ef] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
      {conversations.length === 0 ? (
        <p className="px-2.5 py-2 text-xs leading-5 text-[#8a8a86]">暂无对话，可在更多菜单中新建对话。</p>
      ) : (
        <div className="space-y-1">
          {visibleConversations.map((conversation) => (
            <IngestAgentConversationItem
              key={conversation.id}
              conversation={conversation}
              active={conversation.id === activeConversationId}
              onSelect={(conversationId) => onSelectConversation(agentId, conversationId)}
              onRename={setRenameTarget}
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
          {expandedAll ? "收起" : `展开更多 ${conversations.length - 3} 条`}
        </button>
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
