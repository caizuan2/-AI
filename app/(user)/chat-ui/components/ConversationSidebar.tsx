"use client";

import * as React from "react";
import { MessageSquareText, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatConversationTime } from "../chat-ui-state";
import type { ChatConversation } from "../types";

interface ConversationSidebarProps {
  conversations: ChatConversation[];
  activeConversationId: string | null;
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onSelect: (conversationId: string) => void;
}

export function ConversationSidebar({
  conversations,
  activeConversationId,
  open,
  loading,
  onClose,
  onNewChat,
  onSelect
}: ConversationSidebarProps) {
  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-30 bg-slate-950/20 backdrop-blur-sm transition md:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        aria-hidden="true"
        onClick={onClose}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-80 max-w-[86vw] flex-col border-r border-slate-200 bg-white shadow-xl transition-transform md:static md:z-auto md:w-80 md:translate-x-0 md:shadow-none",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="历史会话"
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-100 px-4">
          <div>
            <p className="text-sm font-semibold text-slate-950">历史会话</p>
            <p className="text-xs text-slate-500">只显示当前账号的记录</p>
          </div>
          <button
            type="button"
            className="focus-ring rounded-full p-2 text-slate-500 hover:bg-slate-100 md:hidden"
            onClick={onClose}
            aria-label="关闭历史会话"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-4">
          <button
            type="button"
            onClick={onNewChat}
            className="focus-ring flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            新建对话
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          {loading ? (
            <div className="space-y-2 px-1">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-16 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
              暂无历史会话
            </div>
          ) : (
            <div className="space-y-2">
              {conversations.map((conversation) => {
                const active = conversation.id === activeConversationId;

                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => onSelect(conversation.id)}
                    className={cn(
                      "focus-ring w-full rounded-xl px-3 py-3 text-left transition",
                      active ? "bg-blue-50 text-blue-900" : "hover:bg-slate-50"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                          active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"
                        )}
                      >
                        <MessageSquareText className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-900">
                          {conversation.title || "新会话"}
                        </span>
                        <span className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                          <span>{formatConversationTime(conversation.updated_at)}</span>
                          <span>{conversation.mode === "expert" ? "专家研判" : "业务处理"}</span>
                        </span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
