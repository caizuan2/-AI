"use client";

import * as React from "react";
import Image from "next/image";
import {
  Archive,
  Bell,
  Camera,
  Check,
  MoreHorizontal,
  MessageCircle,
  PencilLine,
  Pin,
  PinOff,
  ScanLine,
  Search,
  Settings,
  Share2,
  SquarePen,
  Trash2,
  UsersRound,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatConversationTime,
  getCurrentChatUserInitial
} from "../chat-ui-state";
import { sanitizeVisibleText } from "@/lib/ai-chat/visible-output-sanitizer";
import type { ChangePasswordInput, ChatConversation, CurrentChatUser } from "../types";
import { AvatarSettingsDialog } from "./AvatarSettingsDialog";
import { ChatSettingsMenu } from "./ChatSettingsMenu";

export type SidebarConversationAction =
  | "share"
  | "group-chat"
  | "rename"
  | "toggle-pin"
  | "archive"
  | "delete";

interface ChatSidebarDrawerProps {
  conversations: ChatConversation[];
  activeConversationId: string | null;
  open: boolean;
  loading: boolean;
  currentUser?: CurrentChatUser | null;
  userName?: string;
  userDescription?: string;
  avatarUrl?: string | null;
  onClose: () => void;
  onNewChat: () => void;
  onSelect: (conversationId: string) => void;
  onScan?: () => void;
  onScanFileSelected?: (file: File) => void;
  onMessages?: () => void;
  onLogout?: () => void;
  onAvatarSaved?: (avatarUrl: string | null) => void;
  onChangeName?: (name: string) => Promise<void> | void;
  onChangePassword?: (input: ChangePasswordInput) => Promise<void> | void;
  onSwitchAccount?: () => void;
  pinnedConversationIds?: string[];
  desktopLayout?: boolean;
  onConversationAction?: (
    action: SidebarConversationAction,
    item: { id: string; title: string; pinned: boolean }
  ) => void;
}

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
  return conversations.map((conversation, index) => {
    const title = sanitizeVisibleText(conversation.title || "") || `小董AI对话 ${index + 1}`;

    return {
      id: conversation.id,
      title,
      updatedAt: conversation.updated_at,
      mode: conversation.mode
    };
  });
}

function BrandMark() {
  return (
    <span className="relative inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
      <Image
        src="/brand/xiaodong-ai-logo.png"
        alt="小董AI Logo"
        fill
        sizes="48px"
        className="object-cover"
      />
    </span>
  );
}

function SafeAvatar({
  avatarUrl,
  fallback,
  className,
  imageClassName = "h-full w-full object-cover"
}: {
  avatarUrl?: string | null;
  fallback: string;
  className: string;
  imageClassName?: string;
}) {
  const [failed, setFailed] = React.useState(false);
  const cleanAvatarUrl = typeof avatarUrl === "string" ? avatarUrl.trim() : "";

  React.useEffect(() => {
    setFailed(false);
  }, [cleanAvatarUrl]);

  return (
    <span className={className}>
      {cleanAvatarUrl && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cleanAvatarUrl}
          alt=""
          className={imageClassName}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        fallback
      )}
    </span>
  );
}

export function ChatSidebarDrawer({
  conversations,
  activeConversationId,
  open,
  loading,
  currentUser = null,
  userName = "当前用户",
  userDescription = "",
  avatarUrl = null,
  onClose,
  onNewChat,
  onSelect,
  onScan,
  onScanFileSelected,
  onMessages,
  onLogout,
  onAvatarSaved,
  onChangeName,
  onChangePassword,
  onSwitchAccount,
  pinnedConversationIds = [],
  desktopLayout = true,
  onConversationAction
}: ChatSidebarDrawerProps) {
  const [query, setQuery] = React.useState("");
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [avatarDialogOpen, setAvatarDialogOpen] = React.useState(false);
  const [notificationsOpen, setNotificationsOpen] = React.useState(false);
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);
  const scanInputRef = React.useRef<HTMLInputElement | null>(null);
  const activeMenuRootRef = React.useRef<HTMLDivElement | null>(null);
  const notificationsRootRef = React.useRef<HTMLDivElement | null>(null);
  const settingsRootRef = React.useRef<HTMLDivElement | null>(null);
  const items = buildSidebarItems(conversations);
  const pinnedIdSet = React.useMemo(() => new Set(pinnedConversationIds), [pinnedConversationIds]);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredItems = items.filter((item) => {
    if (!normalizedQuery) {
      return true;
    }

    const searchText = [
      item.title,
      item.mode === "expert" ? "专家研判" : "业务处理",
      formatConversationTime(item.updatedAt),
      item.updatedAt
    ].join(" ").toLowerCase();

    return searchText.includes(normalizedQuery);
  });
  const pinnedItems = filteredItems.filter((item) => pinnedIdSet.has(item.id));
  const recentItems = filteredItems.filter((item) => !pinnedIdSet.has(item.id));

  React.useEffect(() => {
    if (!open) {
      setOpenMenuId(null);
      setSettingsOpen(false);
      setNotificationsOpen(false);
    }
  }, [open]);

  React.useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (openMenuId && activeMenuRootRef.current && !activeMenuRootRef.current.contains(target)) {
        setOpenMenuId(null);
      }

      if (settingsOpen && settingsRootRef.current && !settingsRootRef.current.contains(target)) {
        setSettingsOpen(false);
      }

      if (notificationsOpen && notificationsRootRef.current && !notificationsRootRef.current.contains(target)) {
        setNotificationsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      if (openMenuId) {
        setOpenMenuId(null);
        return;
      }

      if (settingsOpen) {
        setSettingsOpen(false);
        return;
      }

      if (notificationsOpen) {
        setNotificationsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [notificationsOpen, openMenuId, settingsOpen]);

  function handleSelect(item: SidebarItem) {
    if (item.mock) {
      onNewChat();
      return;
    }

    onSelect(item.id);
  }

  function handleScanClick() {
    setSettingsOpen(false);
    setNotificationsOpen(false);
    onScan?.();
    scanInputRef.current?.click();
  }

  function handleScanFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;

    event.currentTarget.value = "";

    if (file) {
      onScanFileSelected?.(file);
    }
  }

  function handleNotificationsClick() {
    setOpenMenuId(null);
    setSettingsOpen(false);
    setNotificationsOpen((value) => !value);
    onMessages?.();
  }

  function handleConversationAction(action: SidebarConversationAction, item: SidebarItem) {
    if (item.mock) {
      onNewChat();
      return;
    }

    setOpenMenuId(null);
    onConversationAction?.(action, {
      id: item.id,
      title: item.title,
      pinned: pinnedIdSet.has(item.id)
    });
  }

  function renderConversationItem(item: SidebarItem, index: number) {
    const active = item.id === activeConversationId;
    const pinned = pinnedIdSet.has(item.id);

    return (
      <div
        key={item.id}
        ref={openMenuId === item.id ? activeMenuRootRef : undefined}
        className={cn(
          "relative flex w-full items-center gap-2 rounded-2xl border px-2 py-1.5 transition",
          active
            ? "border-blue-200 bg-blue-50 text-blue-950"
            : "border-transparent hover:bg-slate-50"
        )}
      >
        <button
          type="button"
          onClick={() => handleSelect(item)}
          className="focus-ring flex min-w-0 flex-1 items-center gap-3 rounded-xl px-0 py-1 text-left"
        >
          <span
            className={cn(
              "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
              active ? "bg-blue-600 text-white" : iconColors[index % iconColors.length]
            )}
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1.5">
              {pinned ? <Pin className="h-3.5 w-3.5 shrink-0 text-blue-600" aria-hidden="true" /> : null}
              <span className="block truncate text-[15px] font-semibold text-slate-950">{item.title}</span>
            </span>
            {conversations.length > 0 ? (
              <span className="mt-0.5 block text-xs text-slate-400">
                {formatConversationTime(item.updatedAt)}
              </span>
            ) : null}
          </span>
          {active ? (
            <Check className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
          ) : null}
        </button>
        {!item.mock ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setSettingsOpen(false);
              setNotificationsOpen(false);
              setOpenMenuId((value) => (value === item.id ? null : item.id));
            }}
            title="会话操作"
            className={cn(
              "focus-ring inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition",
              openMenuId === item.id
                ? "border-slate-300 bg-white text-slate-950 shadow-sm"
                : "border-slate-200 bg-white/85 text-slate-600 hover:border-slate-300 hover:bg-white hover:text-slate-950 hover:shadow-sm"
            )}
            aria-label={`${item.title} 会话操作`}
            aria-expanded={openMenuId === item.id}
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : null}
        {openMenuId === item.id ? (
          <div className="absolute right-2 top-12 z-[60] w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white py-2 text-sm font-semibold text-slate-700 shadow-2xl">
            <button type="button" onClick={() => handleConversationAction("share", item)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50">
              <Share2 className="h-4 w-4 text-slate-500" aria-hidden="true" />
              分享
            </button>
            <button type="button" onClick={() => handleConversationAction("group-chat", item)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50">
              <UsersRound className="h-4 w-4 text-slate-500" aria-hidden="true" />
              开始群聊
            </button>
            <button type="button" onClick={() => handleConversationAction("rename", item)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50">
              <PencilLine className="h-4 w-4 text-slate-500" aria-hidden="true" />
              重命名
            </button>
            <button type="button" onClick={() => handleConversationAction("toggle-pin", item)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50">
              {pinned ? <PinOff className="h-4 w-4 text-slate-500" aria-hidden="true" /> : <Pin className="h-4 w-4 text-slate-500" aria-hidden="true" />}
              {pinned ? "取消置顶聊天" : "置顶聊天"}
            </button>
            <button type="button" onClick={() => handleConversationAction("archive", item)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50">
              <Archive className="h-4 w-4 text-slate-500" aria-hidden="true" />
              归档
            </button>
            <div className="my-1 border-t border-slate-100" />
            <button type="button" onClick={() => handleConversationAction("delete", item)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-red-600 hover:bg-red-50">
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              删除
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  function renderConversationSection(title: string, sectionItems: SidebarItem[], offset = 0) {
    if (sectionItems.length === 0) {
      return null;
    }

    return (
      <section className="space-y-1">
        <h3 className="px-2 pb-1 pt-3 text-xs font-bold text-slate-400">{title}</h3>
        {sectionItems.map((item, index) => renderConversationItem(item, offset + index))}
      </section>
    );
  }

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-slate-950/25 transition-opacity",
          desktopLayout && "lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        aria-hidden="true"
        onClick={onClose}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[330px] max-w-[82vw] flex-col bg-white shadow-2xl transition-transform duration-200",
          desktopLayout && "lg:static lg:inset-auto lg:z-auto lg:h-full lg:max-w-none lg:shrink-0 lg:border-r lg:border-slate-100 lg:shadow-none lg:transition-none",
          open ? "translate-x-0" : "pointer-events-none -translate-x-full",
          desktopLayout && (open ? "lg:flex" : "lg:hidden")
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
            <button
              type="button"
              onClick={onClose}
              className="focus-ring inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              aria-label="关闭历史会话"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <BrandMark />
            <div className="min-w-0">
              <p className="text-lg font-bold text-slate-950">小董AI</p>
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
              <div className="px-2 py-8 text-center text-sm text-slate-400">
                {query.trim() ? "暂无匹配会话" : "暂无历史会话"}
              </div>
            ) : (
              <div className="space-y-2">
                {renderConversationSection("已置顶", pinnedItems)}
                {renderConversationSection("最近", recentItems, pinnedItems.length)}
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 pt-3">
            <div className="flex items-center gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAvatarDialogOpen(true)}
                  title="修改头像"
                  className="focus-ring group relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-200 text-base font-bold text-slate-700"
                  aria-label="修改头像"
                >
                  <SafeAvatar
                    avatarUrl={avatarUrl}
                    fallback={getCurrentChatUserInitial(currentUser)}
                    className="flex h-full w-full items-center justify-center"
                  />
                  <span className="absolute inset-0 hidden items-center justify-center bg-slate-950/45 text-white group-hover:flex">
                    <Camera className="h-4 w-4" aria-hidden="true" />
                  </span>
                </button>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-950">{userName}</p>
                  {userDescription ? (
                    <p className="truncate text-[11px] text-slate-400">{userDescription}</p>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1 text-slate-900">
                <button
                  type="button"
                  onClick={handleScanClick}
                  className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-xl hover:bg-slate-50"
                  aria-label="扫描内容"
                >
                <ScanLine className="h-6 w-6" aria-hidden="true" />
                </button>
                <div ref={notificationsRootRef} className="relative">
                  <button
                    type="button"
                    onClick={handleNotificationsClick}
                    className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-xl hover:bg-slate-50"
                    aria-label="消息"
                    aria-expanded={notificationsOpen}
                  >
                  <Bell className="h-6 w-6" aria-hidden="true" />
                  </button>
                  {notificationsOpen ? (
                    <div className="absolute bottom-12 right-0 z-50 w-64 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-bold text-slate-950">通知</p>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                          0 条
                        </span>
                      </div>
                      <div className="mt-3 rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
                        暂无通知
                      </div>
                    </div>
                  ) : null}
                </div>
                <div ref={settingsRootRef} className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setOpenMenuId(null);
                      setNotificationsOpen(false);
                      setSettingsOpen((value) => !value);
                    }}
                    className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-xl hover:bg-slate-50"
                    aria-label="设置"
                    aria-expanded={settingsOpen}
                  >
                    <Settings className="h-6 w-6" aria-hidden="true" />
                  </button>
                  <ChatSettingsMenu
                    open={settingsOpen}
                    userName={userName}
                    userAccount={userDescription}
                    onOpenAvatar={() => {
                      setSettingsOpen(false);
                      setAvatarDialogOpen(true);
                    }}
                    onLogout={onLogout}
                    onChangeName={onChangeName}
                    onChangePassword={onChangePassword}
                    onSwitchAccount={onSwitchAccount}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>
      <AvatarSettingsDialog
        open={avatarDialogOpen}
        user={currentUser}
        userName={userName}
        userAccount={userDescription}
        avatarUrl={avatarUrl}
        onClose={() => setAvatarDialogOpen(false)}
        onSaved={(nextAvatarUrl) => onAvatarSaved?.(nextAvatarUrl)}
      />
      <input
        ref={scanInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-label="选择扫描图片"
        onChange={handleScanFileChange}
      />
    </>
  );
}
