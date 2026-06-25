"use client";

import * as React from "react";
import { Menu, Plus } from "lucide-react";
import { AppUpdateNotice } from "@/components/AppUpdateNotice";
import { CapacitorOtaUpdater } from "@/components/ota/CapacitorOtaUpdater";
import { USER_APP_KIND } from "@/lib/app-version";
import { buildBusinessExecutionPlan, buildBusinessExecutionPrompt } from "@/lib/business-execution-engine";
import { cn } from "@/lib/utils";
import { detectUserIntent } from "@/lib/user-intent-detector";
import {
  archiveConversation,
  askChatStream,
  changeCurrentUserPassword,
  createConversationGroupChat,
  deleteConversation,
  deleteConversationGroupChatLink,
  fetchConversationHistory,
  fetchConversations,
  fetchCurrentChatUser,
  fetchQuickActionCategories,
  logoutCurrentChatUser,
  renameConversation,
  resetConversationGroupChatLink,
  shareConversation,
  updateCurrentChatUserName,
  uploadChatAttachments,
  USER_CHAT_LOGIN_URL
} from "../api";
import type { AskChatStreamEvent, ConversationActionResponse } from "../api";
import {
  createNewChatState,
  createUserMessage,
  getChatUserAvatarStorageKey,
  getCurrentChatUserAvatarUrl,
  getCurrentChatUserDisplayAccount,
  getCurrentChatUserDisplayName,
  normalizeChatMode
} from "../chat-ui-state";
import { ChatInput } from "./ChatInput";
import { ChatMessages } from "./ChatMessages";
import { ChatQuickActions } from "./ChatQuickActions";
import { ChatSidebarDrawer, type SidebarConversationAction } from "./ChatSidebarDrawer";
import {
  ConfirmActionDialog,
  LinkActionDialog,
  RenameConversationDialog
} from "./ConversationActionDialog";
import type {
  ChatConversation,
  ChatAttachmentDraft,
  ChatMessageView,
  ChatMode,
  ChangePasswordInput,
  ChatQuickActionItem,
  CurrentChatUser
} from "../types";

const PINNED_CONVERSATION_STORAGE_KEY = "chat-ui:pinned-conversation-ids";

type LinkDialogState = {
  kind: "share" | "group-chat";
  conversationId?: string;
  title: string;
  link: string;
  description: string;
  copySuccessMessage: string;
  allowGroupLinkManagement?: boolean;
} | null;

type RenameDialogState = {
  conversationId: string;
  title: string;
} | null;

type ConfirmDialogState = {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
} | null;

function readPinnedConversationIds() {
  if (typeof window === "undefined") {
    return new Set<string>();
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(PINNED_CONVERSATION_STORAGE_KEY) ?? "[]");

    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function writePinnedConversationIds(ids: Set<string>) {
  try {
    window.localStorage.setItem(PINNED_CONVERSATION_STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // Local pinning is a UI convenience; storage failures must not block menu actions.
  }
}

function getActionString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getActionRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function getConversationActionLink(result: ConversationActionResponse, fields: string[]) {
  const records = [
    result,
    getActionRecord(result.conversation),
    getActionRecord(getActionRecord(result.conversation).conversationControl),
    getActionRecord(getActionRecord(getActionRecord(result.conversation).conversationControl).share),
    getActionRecord(getActionRecord(getActionRecord(result.conversation).conversationControl).groupChat)
  ];

  for (const record of records) {
    for (const field of fields) {
      const value = getActionString(record[field]);

      if (value) {
        return value;
      }
    }
  }

  return "";
}

function getActionConversationTitle(result: ConversationActionResponse) {
  const conversation = getActionRecord(result.conversation);

  return getActionString(conversation.title);
}

function shouldDefaultOpenSidebar() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.innerWidth >= 1024;
}

const QUICK_ACTION_PLACEHOLDER_HINTS: Record<string, string> = {
  "业务问题": "请根据客户对话生成可直接复制的回复话术，并给出下一步引导。",
  "回复话术": "请帮我整理一段可以直接发给客户的专业回复话术。",
  "客户截图分析": "请上传客户截图或粘贴客户对话，我会调用小董AI大脑🧠分析客户意图并给出回复方案。",
  "成交路径": "请根据当前客户情况，生成成交推进路径和下一步动作。",
  "专家研判": "请从专业角度判断客户问题、风险点和推荐处理方式。",
  "深度思考": "请进行深度分析，给出问题原因、解决策略和可执行步骤。",
  "大脑搜索": "请优先检索小董AI大脑🧠中的相关资料，再给出可靠回复。",
  "客户对话": "请粘贴客户对话，我会判断客户意图并生成可直接复制的回复话术。",
  "小董AI大脑🧠检索": "请优先检索小董AI大脑🧠中的相关资料，再给出可靠回复。",
  "成交建议": "请根据当前客户情况，生成成交推进路径和下一步动作。"
};

function getQuickActionPlaceholder(action: ChatQuickActionItem) {
  const label = action.label.trim();

  return QUICK_ACTION_PLACEHOLDER_HINTS[label] ?? action.prompt?.trim() ?? label;
}

export function ChatShell() {
  const [mode, setMode] = React.useState<ChatMode>("fast");
  const [enableDeepThinking, setEnableDeepThinking] = React.useState(false);
  const [enableWebSearch, setEnableWebSearch] = React.useState(false);
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [conversations, setConversations] = React.useState<ChatConversation[]>([]);
  const [pinnedConversationIds, setPinnedConversationIds] = React.useState<Set<string>>(() => new Set());
  const [messages, setMessages] = React.useState<ChatMessageView[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [conversationLoading, setConversationLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [quickActionPlaceholder, setQuickActionPlaceholder] = React.useState<string | null>(null);
  const [quickActions, setQuickActions] = React.useState<ChatQuickActionItem[]>([]);
  const [currentUser, setCurrentUser] = React.useState<CurrentChatUser | null>(null);
  const [currentAvatarUrl, setCurrentAvatarUrl] = React.useState<string | null>(null);
  const [linkDialog, setLinkDialog] = React.useState<LinkDialogState>(null);
  const [linkActionBusy, setLinkActionBusy] = React.useState(false);
  const [linkDialogError, setLinkDialogError] = React.useState<string | null>(null);
  const [renameDialog, setRenameDialog] = React.useState<RenameDialogState>(null);
  const [renameSubmitting, setRenameSubmitting] = React.useState(false);
  const [renameError, setRenameError] = React.useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = React.useState<ConfirmDialogState>(null);
  const [sidebarUserToggled, setSidebarUserToggled] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const historyRequestIdRef = React.useRef(0);
  const activeAskAbortRef = React.useRef<AbortController | null>(null);
  const currentUserName = getCurrentChatUserDisplayName(currentUser);
  const currentUserAccount = getCurrentChatUserDisplayAccount(currentUser);
  const visibleConversations = React.useMemo(() => {
    const originalIndex = new Map(conversations.map((conversation, index) => [conversation.id, index]));

    return [...conversations].sort((left, right) => {
      const leftPinned = pinnedConversationIds.has(left.id);
      const rightPinned = pinnedConversationIds.has(right.id);

      if (leftPinned !== rightPinned) {
        return leftPinned ? -1 : 1;
      }

      if (leftPinned && rightPinned) {
        return (originalIndex.get(left.id) ?? 0) - (originalIndex.get(right.id) ?? 0);
      }

      return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
    });
  }, [conversations, pinnedConversationIds]);

  const loadConversations = React.useCallback(async () => {
    setConversationLoading(true);

    try {
      const result = await fetchConversations();

      setConversations(result.conversations);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "会话列表加载失败。");
    } finally {
      setConversationLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  React.useEffect(() => {
    setPinnedConversationIds(readPinnedConversationIds());
  }, []);

  React.useEffect(() => {
    if (sidebarUserToggled) {
      return;
    }

    function syncSidebarDefaultOpen() {
      setSidebarOpen(shouldDefaultOpenSidebar());
    }

    syncSidebarDefaultOpen();
    window.addEventListener("resize", syncSidebarDefaultOpen);

    return () => {
      window.removeEventListener("resize", syncSidebarDefaultOpen);
    };
  }, [sidebarUserToggled]);

  React.useEffect(() => {
    let mounted = true;

    async function loadQuickActions() {
      const categories = await fetchQuickActionCategories();

      if (mounted) {
        setQuickActions(categories);
      }
    }

    void loadQuickActions();

    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    let mounted = true;

    async function loadCurrentUser() {
      try {
        const result = await fetchCurrentChatUser();

        if (mounted) {
          setCurrentUser(result.user);
        }
      } catch {
        if (mounted) {
          setCurrentUser(null);
        }
      }
    }

    void loadCurrentUser();

    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    if (!currentUser) {
      setCurrentAvatarUrl(null);
      return;
    }

    const remoteAvatarUrl = getCurrentChatUserAvatarUrl(currentUser);

    if (remoteAvatarUrl) {
      setCurrentAvatarUrl(remoteAvatarUrl);
      return;
    }

    try {
      setCurrentAvatarUrl(window.localStorage.getItem(getChatUserAvatarStorageKey(currentUser)));
    } catch {
      setCurrentAvatarUrl(null);
    }
  }, [currentUser]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [messages, loading]);

  React.useEffect(() => () => {
    activeAskAbortRef.current?.abort();
  }, []);

  function closeSidebarManually() {
    setSidebarUserToggled(true);
    setSidebarOpen(false);
  }

  function toggleSidebarManually() {
    setSidebarUserToggled(true);
    setSidebarOpen((open) => !open);
  }

  function closeSidebarAfterNavigation() {
    if (!shouldDefaultOpenSidebar()) {
      closeSidebarManually();
    }
  }

  function abortActiveAsk(message = "已停止生成。") {
    const activeController = activeAskAbortRef.current;

    if (!activeController) {
      return;
    }

    activeController.abort();
    activeAskAbortRef.current = null;
    setLoading(false);
    showNotice(message);
  }

  async function handleSelectConversation(nextConversationId: string) {
    activeAskAbortRef.current?.abort();
    activeAskAbortRef.current = null;
    const requestId = historyRequestIdRef.current + 1;

    historyRequestIdRef.current = requestId;
    setError(null);
    setNotice(null);
    setHistoryLoading(true);
    setConversationId(nextConversationId);
    setMessages([]);
    closeSidebarAfterNavigation();

    try {
      const history = await fetchConversationHistory(nextConversationId);

      if (historyRequestIdRef.current !== requestId) {
        return;
      }

      setConversationId(history.conversation.id || nextConversationId);
      setMode(normalizeChatMode(history.conversation.mode));
      setMessages(Array.isArray(history.messages) ? history.messages : []);
    } catch {
      if (historyRequestIdRef.current !== requestId) {
        return;
      }

      setError("历史记录加载失败，请稍后重试");
      setMessages([]);
    } finally {
      if (historyRequestIdRef.current === requestId) {
        setHistoryLoading(false);
      }
    }
  }

  function handleNewChat() {
    activeAskAbortRef.current?.abort();
    activeAskAbortRef.current = null;
    const nextState = createNewChatState();

    historyRequestIdRef.current += 1;
    setHistoryLoading(false);
    setConversationId(nextState.conversationId);
    setMessages(nextState.messages);
    setInput(nextState.input);
    setError(nextState.error);
    setNotice(null);
    setQuickActionPlaceholder(null);
    closeSidebarAfterNavigation();
  }

  function showNotice(message: string) {
    setNotice(message);
  }

  function updateAssistantMessageMetadata(
    messageId: string,
    updater: (metadata: Record<string, unknown>) => Record<string, unknown>
  ) {
    setMessages((current) => current.map((message) => (
      message.id === messageId
        ? {
            ...message,
            metadata: updater(message.metadata ?? {})
          }
        : message
    )));
  }

  function getMetadataRecord(metadata: Record<string, unknown>, key: string) {
    const value = metadata[key];

    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  }

  function getMetadataArray(metadata: Record<string, unknown>, key: string) {
    const value = metadata[key];

    return Array.isArray(value) ? value as Record<string, unknown>[] : [];
  }

  function handleEditUserMessage(content: string) {
    setInput(content);
    showNotice(content.trim() ? "已填回输入框，可修改后重新发送。" : "该消息暂无文字可编辑。");
  }

  function handleQuickAction(action: ChatQuickActionItem) {
    if (action.kind === "mode" && action.mode) {
      setMode(action.mode);
    }

    setNotice(null);
    setQuickActionPlaceholder(getQuickActionPlaceholder(action));
  }

  async function handleLogout() {
    try {
      await logoutCurrentChatUser();
    } finally {
      window.location.href = USER_CHAT_LOGIN_URL;
    }
  }

  function handleScan() {
    showNotice("已打开扫描入口。移动端可调用相机，桌面端可选择图片，二维码识别能力后续接入。");
  }

  function handleScanFileSelected(file: File) {
    showNotice(`已选择扫描图片：${file.name}。当前先保留图片入口，后续可接入二维码识别。`);
  }

  function handleMessages() {
    showNotice("已打开通知面板。");
  }

  async function copyLinkToClipboard(link: string) {
    if (!navigator.clipboard) {
      return false;
    }

    try {
      await navigator.clipboard.writeText(link);
      return true;
    } catch {
      return false;
    }
  }

  function getActionErrorMessage(actionLabel: string, requestError: unknown) {
    const message = requestError instanceof Error ? requestError.message : "未知错误";

    return `${actionLabel}失败：${message}`;
  }

  function removeConversationFromList(targetConversationId: string) {
    setConversations((current) => current.filter((conversation) => conversation.id !== targetConversationId));

    if (conversationId === targetConversationId) {
      handleNewChat();
    }
  }

  async function handleShareConversationAction(item: { id: string; title: string }) {
    setLinkDialog(null);
    setLinkActionBusy(false);
    setLinkDialogError(null);
    setRenameDialog(null);
    setConfirmDialog(null);
    showNotice("正在创建分享链接...");

    try {
      const result = await shareConversation(item.id);
      const link = getConversationActionLink(result, ["shareUrl", "link", "url"]);

      if (!link) {
        showNotice("分享接口已返回成功，但缺少 shareUrl / link / url 字段。");
        return;
      }

      setLinkDialog({
        kind: "share",
        title: "分享链接",
        link,
        description: "复制链接后可发送给其他人查看当前会话。",
        copySuccessMessage: "分享链接已复制。",
        allowGroupLinkManagement: false
      });
      showNotice("分享链接已创建。");
    } catch (requestError) {
      showNotice(getActionErrorMessage("分享", requestError));
    }
  }

  async function handleGroupChatConversationAction(item: { id: string; title: string }) {
    setLinkDialog(null);
    setLinkActionBusy(false);
    setLinkDialogError(null);
    setRenameDialog(null);
    setConfirmDialog(null);
    showNotice("正在创建群聊链接...");

    try {
      const result = await createConversationGroupChat(item.id);
      const link = getConversationActionLink(result, [
        "inviteUrl",
        "inviteLink",
        "groupLink",
        "shareUrl",
        "joinUrl",
        "link",
        "url"
      ]);

      if (!link) {
        const message = [
          "群聊已创建，但没有邀请链接",
          "服务器已创建群聊，但没有返回 inviteUrl、inviteLink、groupLink、shareUrl、joinUrl、link 或 url 字段。",
          "请联系管理员检查 group-chat 接口返回字段。"
        ].join("\n");

        showNotice(message);
        return;
      }

      setLinkDialog({
        kind: "group-chat",
        conversationId: item.id,
        title: "群组链接",
        link,
        description: "使用群组链接邀请他人加入群聊。任何人可通过此链接加入群聊，并可查看本群历史消息。",
        copySuccessMessage: "群聊链接已复制。",
        allowGroupLinkManagement: true
      });
      showNotice("群组链接已创建。");
    } catch (requestError) {
      showNotice(getActionErrorMessage("开始群聊", requestError));
    }
  }

  async function handleResetGroupChatLink() {
    if (!linkDialog || linkDialog.kind !== "group-chat" || !linkDialog.conversationId) {
      setLinkDialogError("当前群聊弹窗缺少会话 ID，无法重置链接。");
      return;
    }

    setLinkActionBusy(true);
    setLinkDialogError(null);
    showNotice("正在重置群聊链接...");

    try {
      const result = await resetConversationGroupChatLink(linkDialog.conversationId);
      const nextLink = getConversationActionLink(result, [
        "inviteUrl",
        "inviteLink",
        "groupLink",
        "shareUrl",
        "joinUrl",
        "link",
        "url"
      ]);

      if (!nextLink) {
        throw new Error("后端已响应重置，但没有返回新的 inviteUrl / inviteLink / groupLink / shareUrl / joinUrl / link / url 字段。");
      }

      setLinkDialog({
        ...linkDialog,
        link: nextLink
      });
      showNotice("群聊链接已重置。");
    } catch (requestError) {
      const message = getActionErrorMessage("重置群聊链接", requestError);

      setLinkDialogError(message);
      showNotice(message);
    } finally {
      setLinkActionBusy(false);
    }
  }

  function handleDeleteGroupChatLinkRequest() {
    if (!linkDialog || linkDialog.kind !== "group-chat" || !linkDialog.conversationId) {
      setLinkDialogError("当前群聊弹窗缺少会话 ID，无法删除链接。");
      return;
    }

    const targetConversationId = linkDialog.conversationId;

    setConfirmDialog({
      title: "删除群聊链接",
      description: "确定删除当前群聊链接吗？删除后旧链接将无法继续使用。",
      confirmLabel: "删除链接",
      danger: true,
      onConfirm: () => {
        setConfirmDialog(null);
        void runDeleteGroupChatLink(targetConversationId);
      }
    });
  }

  async function runDeleteGroupChatLink(targetConversationId: string) {
    setLinkActionBusy(true);
    setLinkDialogError(null);
    showNotice("正在删除群聊链接...");

    try {
      await deleteConversationGroupChatLink(targetConversationId);
      setLinkDialog(null);
      showNotice("群聊链接已删除。");
    } catch (requestError) {
      const message = getActionErrorMessage("删除群聊链接", requestError);

      setLinkDialogError(message);
      showNotice(message);
    } finally {
      setLinkActionBusy(false);
    }
  }

  function handleRenameConversationAction(item: { id: string; title: string }) {
    setLinkDialog(null);
    setConfirmDialog(null);
    setRenameError(null);
    setRenameDialog({
      conversationId: item.id,
      title: item.title
    });
  }

  async function handleRenameDialogSubmit(nextTitle: string) {
    if (!renameDialog) {
      return;
    }

    if (!nextTitle) {
      setRenameError("会话名称不能为空。");
      return;
    }

    setRenameSubmitting(true);
    setRenameError(null);
    showNotice("正在重命名会话...");

    try {
      const result = await renameConversation(renameDialog.conversationId, nextTitle);
      const updatedTitle = getActionConversationTitle(result) || nextTitle;

      setConversations((current) => current.map((conversation) => (
        conversation.id === renameDialog.conversationId
          ? {
              ...conversation,
              title: updatedTitle,
              updated_at: new Date().toISOString()
            }
          : conversation
      )));
      setRenameDialog(null);
      showNotice("重命名成功。");
    } catch (requestError) {
      setRenameError(getActionErrorMessage("重命名", requestError));
    } finally {
      setRenameSubmitting(false);
    }
  }

  function handleTogglePinConversationAction(item: { id: string; title: string; pinned: boolean }) {
    setPinnedConversationIds((current) => {
      const next = new Set(current);

      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.add(item.id);
      }

      writePinnedConversationIds(next);
      showNotice(next.has(item.id) ? "已置顶聊天（本地排序生效）。" : "已取消置顶聊天。");
      return next;
    });
  }

  async function handleArchiveConversationAction(item: { id: string; title: string }) {
    setLinkDialog(null);
    setRenameDialog(null);
    setConfirmDialog({
      title: "归档会话",
      description: `确认归档「${item.title}」吗？归档后会从当前历史列表移除。`,
      confirmLabel: "归档",
      onConfirm: () => {
        setConfirmDialog(null);
        void runArchiveConversationAction(item);
      }
    });
  }

  async function runArchiveConversationAction(item: { id: string; title: string }) {
    showNotice("正在归档会话...");

    try {
      await archiveConversation(item.id);
      removeConversationFromList(item.id);
      showNotice("会话已归档。");
    } catch (requestError) {
      showNotice(getActionErrorMessage("归档", requestError));
    }
  }

  async function handleDeleteConversationAction(item: { id: string; title: string }) {
    setLinkDialog(null);
    setRenameDialog(null);
    setConfirmDialog({
      title: "删除会话",
      description: `确认删除「${item.title}」吗？删除前还会再确认一次。`,
      confirmLabel: "继续",
      danger: true,
      onConfirm: () => {
        setConfirmDialog({
          title: "再次确认删除",
          description: "删除后该会话会从历史列表移除，但附件会保留。确定继续？",
          confirmLabel: "确认删除",
          danger: true,
          onConfirm: () => {
            setConfirmDialog(null);
            void runDeleteConversationAction(item);
          }
        });
      }
    });
  }

  async function runDeleteConversationAction(item: { id: string; title: string }) {
    showNotice("正在删除会话...");

    try {
      await deleteConversation(item.id);
      removeConversationFromList(item.id);
      showNotice("会话已删除。");
    } catch (requestError) {
      showNotice(getActionErrorMessage("删除", requestError));
    }
  }

  function handleConversationMenuAction(
    action: SidebarConversationAction,
    item: { id: string; title: string; pinned: boolean }
  ) {
    if (action === "share") {
      void handleShareConversationAction(item);
      return;
    }

    if (action === "group-chat") {
      void handleGroupChatConversationAction(item);
      return;
    }

    if (action === "rename") {
      void handleRenameConversationAction(item);
      return;
    }

    if (action === "toggle-pin") {
      handleTogglePinConversationAction(item);
      return;
    }

    if (action === "archive") {
      void handleArchiveConversationAction(item);
      return;
    }

    if (action === "delete") {
      void handleDeleteConversationAction(item);
    }
  }

  async function handleChangePassword(input: ChangePasswordInput) {
    await changeCurrentUserPassword(input);
    showNotice("密码已修改。");
  }

  async function handleChangeName(nextName: string) {
    const result = await updateCurrentChatUserName(nextName);
    const updatedUser = result.user;

    setCurrentUser((user) => ({
      ...(user ?? updatedUser),
      ...updatedUser,
      name: updatedUser.name ?? nextName,
      nickname: updatedUser.nickname ?? updatedUser.name ?? nextName
    }));
  }

  async function handleSwitchAccount() {
    await handleLogout();
  }

  function handleAvatarSaved(nextAvatarUrl: string | null) {
    setCurrentAvatarUrl(nextAvatarUrl);
    setCurrentUser((user) => (
      user
        ? {
            ...user,
            avatar_url: nextAvatarUrl,
            avatarUrl: nextAvatarUrl,
            avatar: nextAvatarUrl,
            profile_image: nextAvatarUrl,
            profileImage: nextAvatarUrl,
            image: nextAvatarUrl
          }
        : user
    ));
  }

  async function submitText(text: string, attachments: ChatAttachmentDraft[] = []) {
    if (!text || loading) {
      if (!text && attachments.length > 0) {
        showNotice("请先输入问题，再随问题一起发送附件。");
      }

      return false;
    }

    setError(null);
    setNotice(null);
    setLoading(true);
    let localUserMessage: ChatMessageView | null = null;
    let localAssistantMessageId: string | null = null;
    let inputCleared = false;
    const hasPreviousAssistantResponse = messages.some((message) => (
      message.role === "assistant" &&
      !message.pending &&
      message.content.trim().length > 0
    ));

    try {
      const uploadedAttachments = await uploadChatAttachments(attachments);
      const commercialExecution = detectUserIntent(text);
      const businessExecution = buildBusinessExecutionPlan(commercialExecution);
      const businessExecutionPrompt = buildBusinessExecutionPrompt(businessExecution);

      const nextUserMessage = {
        ...createUserMessage(text, uploadedAttachments),
        metadata: {
          commercialExecution,
          businessExecution
        }
      };
      const abortController = new AbortController();
      const nextAssistantMessage: ChatMessageView = {
        id: `local-assistant-${Date.now()}`,
        role: "assistant",
        content: "",
        sources: null,
        confidence: null,
        customer_answer: null,
        provider_status: null,
        metadata: {
          commercialExecution,
          businessExecution,
          businessExecutionPrompt
        },
        created_at: "",
        pending: true
      };

      localUserMessage = nextUserMessage;
      localAssistantMessageId = nextAssistantMessage.id;
      activeAskAbortRef.current = abortController;
      setInput("");
      inputCleared = true;
      setMessages((current) => [...current, nextUserMessage, nextAssistantMessage]);

      const result = await askChatStream({
        text,
        attachments: uploadedAttachments,
        conversation_id: conversationId,
        mode,
        enable_deep_thinking: enableDeepThinking,
        enable_web_search: enableWebSearch,
        business_execution: businessExecution,
        business_execution_prompt: businessExecutionPrompt
      }, {
        signal: abortController.signal,
        onThinking: (content) => {
          updateAssistantMessageMetadata(nextAssistantMessage.id, (metadata) => ({
            ...metadata,
            streamThinking: content
          }));
        },
        onRagSearch: (query) => {
          updateAssistantMessageMetadata(nextAssistantMessage.id, (metadata) => ({
            ...metadata,
            ragVisualization: {
              ...getMetadataRecord(metadata, "ragVisualization"),
              query,
              status: "searching"
            }
          }));
        },
        onRagChunk: (event) => {
          updateAssistantMessageMetadata(nextAssistantMessage.id, (metadata) => {
            const ragVisualization = getMetadataRecord(metadata, "ragVisualization");
            const chunks = getMetadataArray(ragVisualization, "chunks");

            return {
              ...metadata,
              ragVisualization: {
                ...ragVisualization,
                status: "streaming",
                chunks: [
                  ...chunks,
                  {
                    content: event.content,
                    chunk_rank: event.chunk_rank ?? null,
                    chunk_id: event.chunk_id ?? null
                  }
                ]
              }
            };
          });
        },
        onRagScore: (event) => {
          updateAssistantMessageMetadata(nextAssistantMessage.id, (metadata) => {
            const ragVisualization = getMetadataRecord(metadata, "ragVisualization");
            const scores = getMetadataArray(ragVisualization, "scores");

            return {
              ...metadata,
              ragVisualization: {
                ...ragVisualization,
                scores: [
                  ...scores,
                  {
                    score: event.score,
                    chunk_rank: event.chunk_rank ?? null
                  }
                ]
              }
            };
          });
        },
        onRagSource: (event) => {
          updateAssistantMessageMetadata(nextAssistantMessage.id, (metadata) => {
            const ragVisualization = getMetadataRecord(metadata, "ragVisualization");
            const sources = getMetadataArray(ragVisualization, "sources");

            return {
              ...metadata,
              ragVisualization: {
                ...ragVisualization,
                sources: [
                  ...sources,
                  {
                    source: event.source,
                    title: event.title ?? null,
                    file_id: event.file_id ?? null,
                    chunk_id: event.chunk_id ?? null
                  }
                ]
              }
            };
          });
        },
        onRagDone: (event) => {
          updateAssistantMessageMetadata(nextAssistantMessage.id, (metadata) => ({
            ...metadata,
            ragVisualization: {
              ...getMetadataRecord(metadata, "ragVisualization"),
              status: "done",
              hitCount: event.hitCount ?? null,
              topK: event.topK ?? null,
              relevance_score: event.relevance_score ?? null
            }
          }));
        },
        onModelSelect: (model) => {
          updateAssistantMessageMetadata(nextAssistantMessage.id, (metadata) => ({
            ...metadata,
            modelVisualization: {
              ...getMetadataRecord(metadata, "modelVisualization"),
              selected_model: model
            }
          }));
        },
        onModelReason: (reason) => {
          updateAssistantMessageMetadata(nextAssistantMessage.id, (metadata) => ({
            ...metadata,
            modelVisualization: {
              ...getMetadataRecord(metadata, "modelVisualization"),
              reason
            }
          }));
        },
        onModelFallback: (chain) => {
          updateAssistantMessageMetadata(nextAssistantMessage.id, (metadata) => ({
            ...metadata,
            modelVisualization: {
              ...getMetadataRecord(metadata, "modelVisualization"),
              fallback_chain: chain
            }
          }));
        },
        onModelMetrics: (event: Extract<AskChatStreamEvent, { type: "model_metrics" }>) => {
          updateAssistantMessageMetadata(nextAssistantMessage.id, (metadata) => ({
            ...metadata,
            modelVisualization: {
              ...getMetadataRecord(metadata, "modelVisualization"),
              metrics: {
                cost_score: event.cost_score ?? null,
                latency_score: event.latency_score ?? null,
                success_rate: event.success_rate ?? null,
                latency_ms: event.latency_ms ?? null
              }
            }
          }));
        },
        onToken: (token) => {
          setMessages((current) => current.map((message) => (
            message.id === nextAssistantMessage.id
              ? {
                  ...message,
                  content: `${message.content}${token}`,
                  pending: true
                }
              : message
          )));
        },
        onFinal: (streamResult) => {
          setConversationId(streamResult.conversation_id);
          setMode(normalizeChatMode(streamResult.mode));
          setMessages((current) => current.map((message) => {
            if (message.id === nextUserMessage.id) {
              return {
                ...message,
                pending: false
              };
            }

            if (message.id === nextAssistantMessage.id) {
              const currentMetadata = message.metadata ?? {};

              return {
                id: streamResult.message_id,
                role: "assistant",
                content: streamResult.answer,
                customer_answer: streamResult.customer_answer ?? null,
                provider_status: streamResult.provider_status ?? null,
                sources: streamResult.sources,
                confidence: streamResult.confidence,
                metadata: {
                  ...currentMetadata,
                  userQuery: text,
                  responseId: streamResult.message_id,
                  behaviorFeedbackSeed: {
                    followUp: hasPreviousAssistantResponse,
                    converted: Boolean(streamResult.customer_answer)
                  }
                },
                created_at: new Date().toISOString(),
                pending: false
              };
            }

            return message;
          }));
        }
      });

      setConversationId(result.conversation_id);
      setMode(normalizeChatMode(result.mode));
      void loadConversations();
      return true;
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") {
        if (localUserMessage && localAssistantMessageId) {
          const failedMessageId = localUserMessage.id;
          const stoppedAssistantId = localAssistantMessageId;

          setMessages((current) => current.map((message) => {
            if (message.id === failedMessageId) {
              return {
                ...message,
                pending: false
              };
            }

            if (message.id === stoppedAssistantId) {
              return {
                ...message,
                content: message.content || "已停止生成。",
                pending: false
              };
            }

            return message;
          }));
        }

        showNotice("已停止生成。");
        return false;
      }

      if (localUserMessage) {
        const failedMessageId = localUserMessage.id;
        const failedAssistantId = localAssistantMessageId;

        setMessages((current) => current.filter((message) => (
          message.id !== failedMessageId &&
          message.id !== failedAssistantId
        )));
      }

      if (inputCleared) {
        setInput(text);
      }

      setError(requestError instanceof Error ? requestError.message : "发送失败，请稍后重试。");
      return false;
    } finally {
      if (activeAskAbortRef.current?.signal.aborted || activeAskAbortRef.current) {
        activeAskAbortRef.current = null;
      }

      setLoading(false);
    }
  }

  async function handleSubmit(attachments: ChatAttachmentDraft[] = []) {
    return submitText(input.trim(), attachments);
  }

  async function handleCopyLinkDialog() {
    if (!linkDialog) {
      return;
    }

    const copied = await copyLinkToClipboard(linkDialog.link);
    showNotice(copied ? linkDialog.copySuccessMessage : `链接已创建，请手动复制：${linkDialog.link}`);
    if (copied) {
      setLinkDialog(null);
      setLinkDialogError(null);
    }
  }

  function handleCloseLinkDialog() {
    setLinkDialog(null);
    setLinkDialogError(null);
    setLinkActionBusy(false);
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <CapacitorOtaUpdater />
      <AppUpdateNotice appKind={USER_APP_KIND} />
      <div className="flex h-screen w-full overflow-hidden bg-white">
        <ChatSidebarDrawer
          conversations={visibleConversations}
          activeConversationId={conversationId}
          open={sidebarOpen}
          loading={conversationLoading}
          currentUser={currentUser}
          userName={currentUserName}
          userDescription={currentUserAccount}
          avatarUrl={currentAvatarUrl}
          desktopLayout
          onClose={closeSidebarManually}
          onNewChat={handleNewChat}
          onSelect={handleSelectConversation}
          onScan={handleScan}
          onScanFileSelected={handleScanFileSelected}
          onMessages={handleMessages}
          onLogout={handleLogout}
          onAvatarSaved={handleAvatarSaved}
          onChangeName={handleChangeName}
          onChangePassword={handleChangePassword}
          onSwitchAccount={handleSwitchAccount}
          pinnedConversationIds={Array.from(pinnedConversationIds)}
          onConversationAction={handleConversationMenuAction}
        />

        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="z-20 shrink-0 bg-white px-4 sm:px-5">
            <span className="sr-only">小董AI 用户端</span>
            <div className="relative flex h-16 items-center justify-between">
              <button
                type="button"
                onClick={toggleSidebarManually}
                className={cn(
                  "focus-ring relative z-10 inline-flex h-12 w-12 items-center justify-center rounded-full text-slate-950 hover:bg-slate-100",
                  sidebarOpen && "lg:pointer-events-none lg:invisible"
                )}
                aria-label={sidebarOpen ? "关闭历史会话" : "打开历史会话"}
              >
                <Menu className="h-8 w-8" strokeWidth={2.4} aria-hidden="true" />
              </button>

              <div className="pointer-events-none absolute inset-x-16 top-1/2 -translate-y-1/2 text-center">
                <h1 className="whitespace-nowrap text-lg font-bold text-slate-950">小董AI</h1>
                <p className="mt-0.5 hidden whitespace-nowrap text-xs font-medium text-slate-400 sm:block">小董AI大脑🧠 + AI思考</p>
              </div>

              <button
                type="button"
                onClick={handleNewChat}
                className="focus-ring relative z-10 ml-auto inline-flex h-11 w-11 items-center justify-center rounded-full text-slate-950 hover:bg-slate-100"
                aria-label="新建对话"
              >
                <Plus className="h-7 w-7" strokeWidth={2.4} aria-hidden="true" />
              </button>
            </div>
          </header>

          {error ? (
            <div className="mx-4 mt-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          {notice ? (
            <div className="mx-4 mt-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              {notice}
            </div>
          ) : null}

          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-white">
            {historyLoading ? (
              <div className="flex min-h-[360px] flex-1 items-center justify-center px-8 text-center text-sm font-semibold text-slate-500">
                正在加载历史记录...
              </div>
            ) : conversationId && messages.length === 0 ? (
              <div className="flex min-h-[360px] flex-1 items-center justify-center px-8 text-center text-sm font-semibold text-slate-500">
                该会话暂无消息
              </div>
            ) : (
              <ChatMessages
                messages={messages}
                loading={loading}
                mode={mode}
                onModeChange={setMode}
                onEditUserMessage={handleEditUserMessage}
                currentUser={currentUser}
                userAvatarUrl={currentAvatarUrl}
              />
            )}
          </div>

          <ChatQuickActions
            mode={mode}
            enableDeepThinking={enableDeepThinking}
            enableWebSearch={enableWebSearch}
            quickActions={quickActions}
            onModeChange={setMode}
            onToggleDeepThinking={() => setEnableDeepThinking((enabled) => !enabled)}
            onToggleWebSearch={() => setEnableWebSearch((enabled) => !enabled)}
            onQuickAction={handleQuickAction}
          />

          <ChatInput
            value={input}
            loading={loading}
            onValueChange={setInput}
            onSubmit={handleSubmit}
            onCancel={abortActiveAsk}
            onStatusMessage={showNotice}
            placeholder={quickActionPlaceholder ?? undefined}
          />
          <LinkActionDialog
            open={Boolean(linkDialog)}
            title={linkDialog?.title ?? ""}
            link={linkDialog?.link ?? ""}
            description={linkDialog?.description ?? ""}
            busy={linkActionBusy}
            error={linkDialogError}
            actionMenu={linkDialog?.allowGroupLinkManagement ? {
              onReset: () => void handleResetGroupChatLink(),
              onDelete: handleDeleteGroupChatLinkRequest
            } : undefined}
            onClose={handleCloseLinkDialog}
            onCopy={handleCopyLinkDialog}
          />
          <RenameConversationDialog
            open={Boolean(renameDialog)}
            title="重命名会话"
            initialTitle={renameDialog?.title ?? ""}
            submitting={renameSubmitting}
            error={renameError}
            onClose={() => {
              if (!renameSubmitting) {
                setRenameDialog(null);
                setRenameError(null);
              }
            }}
            onSubmit={handleRenameDialogSubmit}
          />
          <ConfirmActionDialog
            open={Boolean(confirmDialog)}
            title={confirmDialog?.title ?? ""}
            description={confirmDialog?.description ?? ""}
            confirmLabel={confirmDialog?.confirmLabel ?? "确定"}
            danger={confirmDialog?.danger}
            onClose={() => setConfirmDialog(null)}
            onConfirm={() => confirmDialog?.onConfirm()}
          />
        </main>
      </div>
    </div>
  );
}
