"use client";

import * as React from "react";
import {
  Bell,
  MessageCircle,
  ScanLine,
  Search,
  Settings,
  SquarePen
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatConversationTime } from "../chat-ui-state";
import type { ChatConversation } from "../types";
import { ChatSettingsMenu } from "./ChatSettingsMenu";

interface ChatSidebarDrawerProps {
  conversations: ChatConversation[];
  activeConversationId: string | null;
  open: boolean;
  loading: boolean;
  userName?: string;
  userDescription?: string;
  onClose: () => void;
  onNewChat: () => void;
  onSelect: (conversationId: string) => void;
  onScan?: () => void;
  onMessages?: () => void;
  onLogout?: () => void;
  onChangePassword?: () => void;
  onSwitchAccount?: () => void;
}

const mockConversationTitles = [
  "AI 内容获客系统设计框架与路径",
  "企业科技化转型与授信获取",
  "替换图片二维码",
  "飞书表格新增列表方法",
  "npm 介绍",
  "settings.json 介绍",
  "技术介绍",
  "企业孵化成本明细",
  "腾讯智影官网链接",
  "企业孵化失败案例拆解",
  "权限开通方法"
];

const iconColors = [
  "bg-pink-100 text-pink-500",
  "bg-violet-100 text-violet-500",
  "bg-teal-100 text-teal-500",
  "bg-lime-100 text-lime-600",
  "bg-amber-100 text-amber-600",
  "bg-rose-100 text-rose-500",
  "bg-cyan-100 text-cyan-600",
  "bg-fuchsia-100 text-fuchsia-500",
  "bg-green-100 text-green-600",
  "bg-orange-100 text-orange-500"
];

type SidebarItem = {
  id: string;
  title: string;
  updatedAt: string;
  mode?: "fast" | "expert";
  mock?: boolean;
};

function buildSidebarItems(conversations: ChatConversation[]): SidebarItem[] {
  if (conversations.length > 0) {
    return conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title || "新会话",
      updatedAt: conversation.updated_at,
      mode: conversation.mode
    }));
  }

  return mockConversationTitles.map((title, index) => ({
    id: `mock-${index}`,
    title,
    updatedAt: new Date(Date.now() - index * 1000 * 60 * 60).toISOString(),
    mode: "fast",
    mock: true
  }));
}

export function ChatSidebarDrawer({
  conversations,
  activeConversationId,
  open,
  loading,
  userName = "当前用户",
  userDescription = "AI 知识库账号",
  onClose,
  onNewChat,
  onSelect,
  onScan,
  onMessages,
  onLogout,
  onChangePassword,
  onSwitchAccount
}: ChatSidebarDrawerProps) {
  const [query, setQuery] = React.useState("");
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const items = buildSidebarItems(conversations);
  const filteredItems = items.filter((item) => item.title.toLowerCase().includes(query.trim().toLowerCase()));

  function handleSelect(item: SidebarItem) {
    if (item.mock) {
      onNewChat();
      return;
    }

    onSelect(item.id);
  }

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-slate-950/25 transition-opacity",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        aria-hidden="true"
        onClick={onClose}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[330px] max-w-[82vw] flex-col bg-white shadow-2xl transition-transform duration-200 sm:left-[calc(50%-215px)]",
          open ? "translate-x-0" : "pointer-events-none -translate-x-full"
        )}
        aria-label="历史对话抽屉"
        aria-hidden={!open}
      >
        <div className="flex h-full flex-col px-4 pb-4 pt-11">
          <div className="flex items-center gap-2">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">搜索历史对话</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索"
                className="h-12 w-full rounded-2xl bg-slate-100 pl-10 pr-3 text-base font-medium text-slate-900 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-slate-200"
              />
            </label>
            <button
              type="button"
              onClick={onNewChat}
              className="focus-ring inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-slate-900 hover:bg-slate-100"
              aria-label="新建对话"
            >
              <SquarePen className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <span className="inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-blue-100 to-pink-100 text-2xl">
              AI
            </span>
            <div>
              <p className="text-lg font-bold text-slate-950">AI 知识库</p>
              <p className="text-xs text-slate-400">用户端问答助手</p>
            </div>
          </div>

          <div className="mt-5 border-t border-slate-200" />

          <div className="min-h-0 flex-1 overflow-y-auto py-2">
            {loading ? (
              <div className="space-y-3 pt-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-10 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="px-2 py-8 text-center text-sm text-slate-400">没有找到相关对话</div>
            ) : (
              <div className="space-y-1">
                {filteredItems.map((item, index) => {
                  const active = item.id === activeConversationId;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelect(item)}
                      className={cn(
                        "focus-ring flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition",
                        active ? "bg-slate-100" : "hover:bg-slate-50"
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                          iconColors[index % iconColors.length]
                        )}
                      >
                        <MessageCircle className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold text-slate-950">{item.title}</span>
                        {conversations.length > 0 ? (
                          <span className="mt-0.5 block text-xs text-slate-400">
                            {formatConversationTime(item.updatedAt)}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 pt-3">
            <div className="flex items-center gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-200 text-base">
                  用
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-950">{userName}</p>
                  <p className="truncate text-[11px] text-slate-400">{userDescription}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1 text-slate-900">
                <button
                  type="button"
                  onClick={onScan}
                  className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-xl hover:bg-slate-50"
                  aria-label="扫描内容"
                >
                <ScanLine className="h-6 w-6" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={onMessages}
                  className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-xl hover:bg-slate-50"
                  aria-label="消息"
                >
                <Bell className="h-6 w-6" aria-hidden="true" />
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setSettingsOpen((value) => !value)}
                    className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-xl hover:bg-slate-50"
                    aria-label="设置"
                    aria-expanded={settingsOpen}
                  >
                    <Settings className="h-6 w-6" aria-hidden="true" />
                  </button>
                  <ChatSettingsMenu
                    open={settingsOpen}
                    onLogout={onLogout}
                    onChangePassword={onChangePassword}
                    onSwitchAccount={onSwitchAccount}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
