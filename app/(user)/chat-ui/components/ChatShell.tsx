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
  classifyChatMode,
  createConversationGroupChat,
  deleteConversation,
  deleteConversationGroupChatLink,
  fetchConversationHistory,
  fetchConversations,
  fetchCurrentChatUser,
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
import {
  detectChatMode,
  resolveFinalChatMode,
  type ChatModeDecision,
  type ChatModeKey
} from "../lib/intent-mode-router";
import { safeCopyText } from "../lib/clipboard";
import { ChatInput } from "./ChatInput";
import { ChatMessages } from "./ChatMessages";
import { ChatQuickActions } from "./ChatQuickActions";
import { ChatSidebarDrawer, type SidebarConversationAction } from "./ChatSidebarDrawer";
import { ExpertMarketDrawer } from "./ExpertMarketDrawer";
import { KnowledgeBaseSelector } from "./KnowledgeBaseSelector";
import { PromptKnowledgeBar } from "./PromptKnowledgeBar";
import {
  ConfirmActionDialog,
  LinkActionDialog,
  RenameConversationDialog
} from "./ConversationActionDialog";
import {
  addKnowledgeBaseSelection,
  getActiveKnowledgeBase,
  readStoredKnowledgeBases,
  removeKnowledgeBaseSelection,
  setActiveKnowledgeBaseSelection,
  writeStoredKnowledgeBases
} from "../lib/knowledge-base-selection";
import type {
  ChatConversation,
  ChatAttachmentDraft,
  ChatMessageView,
  ChatMode,
  ChangePasswordInput,
  CurrentChatUser,
  ExpertMarketItem,
  SelectedKnowledgeBase
} from "../types";

const PINNED_CONVERSATION_STORAGE_KEY_PREFIX = "chat-ui:pinned-conversation-ids";
const CHAT_MODE_CLASSIFY_CACHE_PREFIX = "chat-ui:mode-classify:v12.5:";

type LinkDialogState = {
  kind: "share" | "group-chat";
  conversationId?: string;
  title: string;
  link: string;
  description: string;
  copySuccessMessage: string;
  copied: boolean;
  allowGroupLinkManagement?: boolean;
} | null;

type ChatActionKind =
  | "share"
  | "group-chat"
  | "avatar"
  | "rename"
  | "pin"
  | "archive"
  | "delete"
  | "copy"
  | "general";

type ChatActionFeedback = {
  type: "success" | "error" | "info";
  kind: ChatActionKind;
  message: string;
  createdAt: number;
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

function getChatUserStorageIdentity(user: CurrentChatUser | null | undefined) {
  const identity =
    (typeof user?.id === "string" ? user.id.trim() : "") ||
    getCurrentChatUserDisplayAccount(user).trim();

  return identity || null;
}

function getPinnedConversationStorageKey(user: CurrentChatUser | null | undefined) {
  const identity = getChatUserStorageIdentity(user);

  return identity ? `${PINNED_CONVERSATION_STORAGE_KEY_PREFIX}:${encodeURIComponent(identity)}` : null;
}

function readPinnedConversationIds(storageKey: string | null) {
  if (typeof window === "undefined" || !storageKey) {
    return new Set<string>();
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]");

    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function writePinnedConversationIds(ids: Set<string>, storageKey: string | null) {
  if (!storageKey) {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(Array.from(ids)));
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

function isImageLikeAttachment(attachment: ChatAttachmentDraft) {
  return (
    attachment.type === "image" ||
    attachment.type === "camera_photo" ||
    attachment.type === "gallery_photo" ||
    Boolean(attachment.mime_type?.startsWith("image/") || attachment.mimeType?.startsWith("image/"))
  );
}

function getChatModeClassifyCacheKey(input: {
  text: string;
  hasImage: boolean;
  hasAttachment: boolean;
}) {
  return `${CHAT_MODE_CLASSIFY_CACHE_PREFIX}${JSON.stringify({
    text: input.text.trim(),
    hasImage: input.hasImage,
    hasAttachment: input.hasAttachment
  })}`;
}

function readCachedChatModeDecision(cacheKey: string): ChatModeDecision | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(cacheKey) ?? "null") as ChatModeDecision | null;

    return parsed?.mode?.key ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachedChatModeDecision(cacheKey: string, decision: ChatModeDecision) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(cacheKey, JSON.stringify(decision));
  } catch {
    // Classification cache is optional and must not affect chat input.
  }
}

export function ChatShell() {
  const [mode, setMode] = React.useState<ChatMode>("fast");
  const [enableDeepThinking] = React.useState(false);
  const [enableWebSearch] = React.useState(false);
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [conversations, setConversations] = React.useState<ChatConversation[]>([]);
  const [pinnedConversationIds, setPinnedConversationIds] = React.useState<Set<string>>(() => new Set());
  const [messages, setMessages] = React.useState<ChatMessageView[]>([]);
  const [input, setInput] = React.useState("");
  const [inputAttachments, setInputAttachments] = React.useState<ChatAttachmentDraft[]>([]);
  const [manualChatMode, setManualChatMode] = React.useState<ChatModeKey | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [conversationLoading, setConversationLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = React.useState<ChatActionFeedback>(null);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [currentUser, setCurrentUser] = React.useState<CurrentChatUser | null>(null);
  const [currentUserLoaded, setCurrentUserLoaded] = React.useState(false);
  const [currentAvatarUrl, setCurrentAvatarUrl] = React.useState<string | null>(null);
  const [expertMarketOpen, setExpertMarketOpen] = React.useState(false);
  const [selectedKnowledgeBases, setSelectedKnowledgeBases] = React.useState<SelectedKnowledgeBase[]>([]);
  const [linkDialog, setLinkDialog] = React.useState<LinkDialogState>(null);
  const [linkActionBusy, setLinkActionBusy] = React.useState(false);
  const [linkCopyFailureSignal, setLinkCopyFailureSignal] = React.useState(0);
  const [renameDialog, setRenameDialog] = React.useState<RenameDialogState>(null);
  const [renameSubmitting, setRenameSubmitting] = React.useState(false);
  const [renameError, setRenameError] = React.useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = React.useState<ConfirmDialogState>(null);
  const [sidebarUserToggled, setSidebarUserToggled] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const historyRequestIdRef = React.useRef(0);
  const activeAskAbortRef = React.useRef<AbortController | null>(null);
  const chatModeClassifyAbortRef = React.useRef<AbortController | null>(null);
  const activeUserIdentityRef = React.useRef<string | null>(null);
  const currentUserName = getCurrentChatUserDisplayName(currentUser);
  const currentUserAccount = getCurrentChatUserDisplayAccount(currentUser);
  const currentUserIdentity = getChatUserStorageIdentity(currentUser);
  const pinnedConversationStorageKey = getPinnedConversationStorageKey(currentUser);
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
  const inputHasImage = inputAttachments.some(isImageLikeAttachment);
  const inputHasAttachment = inputAttachments.length > 0;
  const activeKnowledgeBase = React.useMemo(() => getActiveKnowledgeBase(selectedKnowledgeBases), [selectedKnowledgeBases]);
  const ruleChatModeDecision = React.useMemo(() => detectChatMode({
    text: input,
    hasImage: inputHasImage,
    hasAttachment: inputHasAttachment
  }), [input, inputHasImage, inputHasAttachment]);
  const chatModeClassifyCacheKey = React.useMemo(() => getChatModeClassifyCacheKey({
    text: input,
    hasImage: inputHasImage,
    hasAttachment: inputHasAttachment
  }), [input, inputHasImage, inputHasAttachment]);
  const [classifiedChatModeDecision, setClassifiedChatModeDecision] = React.useState<{
    cacheKey: string;
    decision: ChatModeDecision;
  } | null>(null);
  const remoteChatModeDecision = classifiedChatModeDecision?.cacheKey === chatModeClassifyCacheKey
    ? classifiedChatModeDecision.decision
    : null;
  const finalChatModeDecision = React.useMemo(() => resolveFinalChatMode({
    aiDecision: remoteChatModeDecision,
    ruleDecision: ruleChatModeDecision,
    manualMode: manualChatMode
  }), [manualChatMode, remoteChatModeDecision, ruleChatModeDecision]);
  const inputPlaceholder = "发送消息给小董AI...";

  const refreshCurrentUser = React.useCallback(async (options: { cacheBust?: boolean } = {}) => {
    const result = await fetchCurrentChatUser(options);

    setCurrentUser(result.user);
    return result.user;
  }, []);

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
      } finally {
        if (mounted) {
          setCurrentUserLoaded(true);
        }
      }
    }

    void loadCurrentUser();

    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    if (!currentUserLoaded) {
      return;
    }

    const nextUserIdentity = currentUserIdentity;
    const previousUserIdentity = activeUserIdentityRef.current;

    if (!nextUserIdentity) {
      activeUserIdentityRef.current = null;
      clearChatSessionState({ clearPinned: true });
      setConversationLoading(false);
      return;
    }

    if (previousUserIdentity !== nextUserIdentity) {
      activeUserIdentityRef.current = nextUserIdentity;
      clearChatSessionState();
      setPinnedConversationIds(readPinnedConversationIds(pinnedConversationStorageKey));
    }

    void loadConversations();
  }, [currentUserLoaded, currentUserIdentity, pinnedConversationStorageKey, loadConversations]);

  React.useEffect(() => {
    if (!currentUserLoaded || !currentUserIdentity) {
      setSelectedKnowledgeBases([]);
      return;
    }

    setSelectedKnowledgeBases(readStoredKnowledgeBases(currentUser));
  }, [currentUser, currentUserIdentity, currentUserLoaded]);

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

  React.useEffect(() => {
    if (!actionFeedback?.message) {
      return undefined;
    }

    const feedbackCreatedAt = actionFeedback.createdAt;
    const timer = window.setTimeout(() => {
      setActionFeedback((current) => (
        current?.createdAt === feedbackCreatedAt ? null : current
      ));
    }, actionFeedback.type === "error" ? 5000 : 3600);

    return () => window.clearTimeout(timer);
  }, [actionFeedback]);

  React.useEffect(() => () => {
    activeAskAbortRef.current?.abort();
    chatModeClassifyAbortRef.current?.abort();
  }, []);

  React.useEffect(() => {
    chatModeClassifyAbortRef.current?.abort();

    if (manualChatMode) {
      return undefined;
    }

    const message = input.trim();

    if (!message || message.length < 4) {
      setClassifiedChatModeDecision(null);
      return undefined;
    }

    const cachedDecision = readCachedChatModeDecision(chatModeClassifyCacheKey);

    if (cachedDecision) {
      setClassifiedChatModeDecision({
        cacheKey: chatModeClassifyCacheKey,
        decision: cachedDecision
      });
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      chatModeClassifyAbortRef.current = controller;
      void classifyChatMode({
        message,
        hasImage: inputHasImage,
        hasAttachment: inputHasAttachment,
        manualMode: null,
        signal: controller.signal
      })
        .then((decision) => {
          if (controller.signal.aborted) {
            return;
          }

          writeCachedChatModeDecision(chatModeClassifyCacheKey, decision);
          setClassifiedChatModeDecision({
            cacheKey: chatModeClassifyCacheKey,
            decision
          });
        })
        .catch((classifyError) => {
          if (classifyError instanceof DOMException && classifyError.name === "AbortError") {
            return;
          }

          setClassifiedChatModeDecision(null);
        });
    }, 700);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [chatModeClassifyCacheKey, input, inputHasAttachment, inputHasImage, manualChatMode]);

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

  function clearChatSessionState(options: { clearPinned?: boolean } = {}) {
    activeAskAbortRef.current?.abort();
    activeAskAbortRef.current = null;
    historyRequestIdRef.current += 1;
    setConversationId(null);
    setConversations([]);
    setMessages([]);
    setInput("");
    setInputAttachments([]);
    setManualChatMode(null);
    setClassifiedChatModeDecision(null);
    setLoading(false);
    setHistoryLoading(false);
    setConversationLoading(false);
    setError(null);
    setActionFeedback(null);
    setLinkDialog(null);
    setLinkActionBusy(false);
    setRenameDialog(null);
    setRenameSubmitting(false);
    setRenameError(null);
    setConfirmDialog(null);

    if (options.clearPinned) {
      setPinnedConversationIds(new Set());
    }
  }

  async function handleSelectConversation(nextConversationId: string) {
    activeAskAbortRef.current?.abort();
    activeAskAbortRef.current = null;
    const requestId = historyRequestIdRef.current + 1;

    historyRequestIdRef.current = requestId;
    setError(null);
    setActionFeedback(null);
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
    setInputAttachments([]);
    setManualChatMode(null);
    setError(nextState.error);
    setActionFeedback(null);
    closeSidebarAfterNavigation();
  }

  function setActionInfo(message: string, kind: ChatActionKind = "general") {
    setError(null);
    setActionFeedback({
      type: "info",
      kind,
      message,
      createdAt: Date.now()
    });
  }

  function setActionSuccess(message: string, kind: ChatActionKind = "general") {
    setError(null);
    setActionFeedback({
      type: "success",
      kind,
      message,
      createdAt: Date.now()
    });
  }

  function setActionError(message: string, kind: ChatActionKind = "general", technical?: unknown) {
    if (technical) {
      console.warn(`[chat-ui] ${kind} action failed`, technical);
    }

    setError(null);
    setActionFeedback({
      type: "error",
      kind,
      message,
      createdAt: Date.now()
    });
  }

  function showNotice(message: string) {
    setActionInfo(message);
  }

  function clearActionFeedback() {
    setError(null);
    setActionFeedback(null);
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
    setManualChatMode(null);
    showNotice(content.trim() ? "已填回输入框，可修改后重新发送。" : "该消息暂无文字可编辑。");
  }

  function handleInputChange(nextValue: string) {
    setInput(nextValue);

    if (!nextValue.trim()) {
      setManualChatMode(null);
      setClassifiedChatModeDecision(null);
    }
  }

  function handleToggleManualChatMode(nextMode: ChatModeKey) {
    setActionFeedback(null);
    setManualChatMode((current) => current === nextMode ? null : nextMode);
  }

  function commitSelectedKnowledgeBases(nextItems: SelectedKnowledgeBase[], message?: string) {
    setSelectedKnowledgeBases(nextItems);
    writeStoredKnowledgeBases(currentUser, nextItems);

    if (message) {
      showNotice(message);
    }
  }

  function handleAddKnowledgeBase(item: ExpertMarketItem) {
    if (selectedKnowledgeBases.some((selected) => selected.kb_id === item.kb_id)) {
      return;
    }

    const nextItems = addKnowledgeBaseSelection(selectedKnowledgeBases, item);

    commitSelectedKnowledgeBases(nextItems);
  }

  function handleRemoveKnowledgeBase(kbId: string) {
    const nextItems = removeKnowledgeBaseSelection(selectedKnowledgeBases, kbId);

    commitSelectedKnowledgeBases(nextItems);
  }

  function handleActivateKnowledgeBase(kbId: string) {
    const nextItems = setActiveKnowledgeBaseSelection(selectedKnowledgeBases, kbId);

    commitSelectedKnowledgeBases(nextItems);
  }

  async function handleLogout() {
    clearChatSessionState({ clearPinned: true });
    activeUserIdentityRef.current = null;
    setSelectedKnowledgeBases([]);
    setCurrentUser(null);

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

  function getActionErrorMessage(actionLabel: string, requestError: unknown) {
    const message = requestError instanceof Error ? requestError.message : "未知错误";

    console.warn(`[chat-ui] ${actionLabel} action failed`, requestError);

    if (actionLabel === "分享") {
      return "分享失败：当前会话暂时无法分享，请稍后再试。";
    }

    if (actionLabel === "开始群聊") {
      return "开始群聊失败：当前会话暂时无法创建群聊链接，请稍后再试。";
    }

    const cleanMessage = message
      .replace(/（endpoint:.*?）/g, "")
      .replace(/\s*endpoint:.*$/i, "")
      .replace(/\s*status\s*[:=]\s*\d+.*$/gim, "")
      .replace(/\s*content-type\s*[:=].*$/gim, "")
      .replace(/\s*stack\s*[:=][\s\S]*$/i, "")
      .replace(/\bFEATURE_DISABLED\b/gi, "")
      .replace(/\bUPSTREAM_UNAVAILABLE\b/gi, "")
      .replace(/\bsourceApp\b/gi, "")
      .replace(/\bmodel_select\b/gi, "")
      .replace(/\bmodel_reason\b/gi, "")
      .replace(/\bcontent-type\b/gi, "")
      .replace(/\bstatus\b/gi, "")
      .replace(/\bACTION_[A-Z0-9_]+\b/gi, "推荐动作")
      .replace(/\bV(?:6|7|8|9)(?:\.\d+)?\b/gi, "")
      .replace(/\bprompt\.[a-z0-9_.-]+\b/gi, "提示策略")
      .replace(/\bchunk(?:[_-]?id)?\b/gi, "知识片段")
      .replace(/\s{2,}/g, " ")
      .trim();

    return `${actionLabel}失败：${cleanMessage || "请稍后再试。"}`;
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
    clearActionFeedback();
    setRenameDialog(null);
    setConfirmDialog(null);
    setActionInfo("正在创建分享链接...", "share");

    try {
      const result = await shareConversation(item.id);
      const link = getConversationActionLink(result, ["shareUrl", "link", "url"]);

      if (!link) {
        console.warn("[chat-ui] share action succeeded without link", result);
        setActionError("分享链接创建失败，请稍后再试。", "share");
        return;
      }

      setError(null);
      setLinkDialog({
        kind: "share",
        title: "分享链接",
        link,
        description: "复制链接后可发送给其他人查看当前会话。",
        copySuccessMessage: "分享链接已复制。",
        copied: false,
        allowGroupLinkManagement: false
      });
      setActionSuccess("分享链接已创建。", "share");
    } catch (requestError) {
      setActionError(getActionErrorMessage("分享", requestError), "share");
    }
  }

  async function handleGroupChatConversationAction(item: { id: string; title: string }) {
    setLinkDialog(null);
    setLinkActionBusy(false);
    clearActionFeedback();
    setRenameDialog(null);
    setConfirmDialog(null);
    setActionInfo("正在创建群聊链接...", "group-chat");

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
        console.warn("[chat-ui] group chat action succeeded without link", result);
        setActionError("群聊链接创建失败，请稍后再试。", "group-chat");
        return;
      }

      setError(null);
      setLinkDialog({
        kind: "group-chat",
        conversationId: item.id,
        title: "群组链接",
        link,
        description: "使用群组链接邀请他人加入群聊。任何人可通过此链接加入群聊，并可查看本群历史消息。",
        copySuccessMessage: "群聊链接已复制。",
        copied: false,
        allowGroupLinkManagement: true
      });
      setActionSuccess("群组链接已创建。", "group-chat");
    } catch (requestError) {
      setActionError(getActionErrorMessage("开始群聊", requestError), "group-chat");
    }
  }

  async function handleResetGroupChatLink() {
    if (!linkDialog || linkDialog.kind !== "group-chat" || !linkDialog.conversationId) {
      setActionError("当前群聊弹窗缺少会话 ID，无法重置链接。", "group-chat");
      return;
    }

    setLinkActionBusy(true);
    clearActionFeedback();
    setActionInfo("正在重置群聊链接...", "group-chat");

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
        console.warn("[chat-ui] group chat reset succeeded without link", result);
        throw new Error("群聊链接重置失败，请稍后再试。");
      }

      setLinkDialog({
        ...linkDialog,
        link: nextLink,
        copied: false
      });
      setActionSuccess("群聊链接已重置。", "group-chat");
    } catch (requestError) {
      const message = getActionErrorMessage("重置群聊链接", requestError);

      setActionError(message, "group-chat");
    } finally {
      setLinkActionBusy(false);
    }
  }

  function handleDeleteGroupChatLinkRequest() {
    if (!linkDialog || linkDialog.kind !== "group-chat" || !linkDialog.conversationId) {
      setActionError("当前群聊弹窗缺少会话 ID，无法删除链接。", "group-chat");
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
    clearActionFeedback();
    setActionInfo("正在删除群聊链接...", "group-chat");

    try {
      await deleteConversationGroupChatLink(targetConversationId);
      setLinkDialog(null);
      setActionSuccess("群聊链接已删除。", "group-chat");
    } catch (requestError) {
      const message = getActionErrorMessage("删除群聊链接", requestError);

      setActionError(message, "group-chat");
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

      writePinnedConversationIds(next, pinnedConversationStorageKey);
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
    clearActionFeedback();
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
    clearActionFeedback();
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
    void refreshCurrentUser({ cacheBust: true })
      .then((user) => {
        const refreshedAvatarUrl = getCurrentChatUserAvatarUrl(user);
        setCurrentAvatarUrl(refreshedAvatarUrl || nextAvatarUrl);
      })
      .catch((requestError) => {
        console.warn("[chat-ui] refresh current user after avatar save failed", requestError);
      });
    setActionSuccess(nextAvatarUrl ? "头像已更新。" : "已恢复默认头像。", "avatar");
  }

  async function submitText(text: string, attachments: ChatAttachmentDraft[] = []) {
    if (!text || loading) {
      if (!text && attachments.length > 0) {
        showNotice("请先输入问题，再随问题一起发送附件。");
      }

      return false;
    }

    setError(null);
    setActionFeedback(null);
    setLoading(true);
    let localUserMessage: ChatMessageView | null = null;
    let localAssistantMessageId: string | null = null;
    let inputCleared = false;
    const submittedManualChatMode = manualChatMode;
    const submittedFinalChatModeDecision = finalChatModeDecision;
    const hasPreviousAssistantResponse = messages.some((message) => (
      message.role === "assistant" &&
      !message.pending &&
      message.content.trim().length > 0
    ));

    try {
      const uploadedAttachments = await uploadChatAttachments(attachments);
      const submitModeDecision = submittedManualChatMode
        ? resolveFinalChatMode({
          ruleDecision: detectChatMode({
            text,
            hasImage: uploadedAttachments.some(isImageLikeAttachment),
            hasAttachment: uploadedAttachments.length > 0
          }),
          manualMode: submittedManualChatMode
        })
        : submittedFinalChatModeDecision;
      const commercialExecution = detectUserIntent(text);
      const businessExecution = buildBusinessExecutionPlan(commercialExecution);
      const modeAlternativesText = submitModeDecision.alternatives
        .map((candidate) => `${candidate.label}(${Math.round(candidate.confidence * 100)}%)`)
        .join("、");
      const modePromptContext = [
        "[USER MODE ROUTING]",
        `最终模式：${submitModeDecision.mode.label}`,
        `来源：${submitModeDecision.source}`,
        `置信度：${Math.round(submitModeDecision.confidence * 100)}%`,
        `原因：${submitModeDecision.reason}`,
        modeAlternativesText ? `备选模式：${modeAlternativesText}` : "",
        "",
        "模式要求：",
        submitModeDecision.mode.prompt
      ].join("\n");
      const businessExecutionPrompt = [
        buildBusinessExecutionPrompt(businessExecution),
        modePromptContext
      ].filter(Boolean).join("\n\n");
      const activeKnowledgeBaseForSubmit = activeKnowledgeBase;
      const selectedKnowledgeBasesForSubmit = selectedKnowledgeBases;
      const knowledgeSelectionMetadata = {
        selectedKnowledgeBases: selectedKnowledgeBasesForSubmit,
        activeKnowledgeBase: activeKnowledgeBaseForSubmit,
        kb_id: activeKnowledgeBaseForSubmit?.kb_id ?? null,
        knowledgeBaseId: activeKnowledgeBaseForSubmit?.knowledgeBaseId ?? activeKnowledgeBaseForSubmit?.kbId ?? activeKnowledgeBaseForSubmit?.kb_id ?? null,
        expert_id: activeKnowledgeBaseForSubmit?.expert_id ?? null,
        agentId: activeKnowledgeBaseForSubmit?.agentId ?? activeKnowledgeBaseForSubmit?.expertId ?? activeKnowledgeBaseForSubmit?.expert_id ?? null,
        tenant_id: activeKnowledgeBaseForSubmit?.tenant_id ?? null,
        namespace: activeKnowledgeBaseForSubmit?.namespace ?? activeKnowledgeBaseForSubmit?.tenant_id ?? null
      };

      const nextUserMessage = {
        ...createUserMessage(text, uploadedAttachments),
        metadata: {
          commercialExecution,
          businessExecution,
          finalChatModeDecision: submitModeDecision,
          knowledgeSelection: knowledgeSelectionMetadata
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
          businessExecutionPrompt,
          finalChatModeDecision: submitModeDecision,
          knowledgeSelection: knowledgeSelectionMetadata
        },
        created_at: "",
        pending: true
      };

      localUserMessage = nextUserMessage;
      localAssistantMessageId = nextAssistantMessage.id;
      activeAskAbortRef.current = abortController;
      setInput("");
      setInputAttachments([]);
      setManualChatMode(null);
      inputCleared = true;
      setMessages((current) => [...current, nextUserMessage, nextAssistantMessage]);

      const result = await askChatStream({
        text,
        attachments: uploadedAttachments,
        conversation_id: conversationId,
        mode,
        userMode: submitModeDecision.mode.key,
        modeSource: submitModeDecision.source,
        modeLabel: submitModeDecision.mode.label,
        modePrompt: submitModeDecision.mode.prompt,
        modeConfidence: submitModeDecision.confidence,
        modeReason: submitModeDecision.reason,
        modeAlternatives: submitModeDecision.alternatives,
        classifierVersion: submitModeDecision.classifierVersion,
        enable_deep_thinking: enableDeepThinking,
        enable_web_search: enableWebSearch,
        business_execution: businessExecution,
        business_execution_prompt: businessExecutionPrompt,
        selectedKnowledgeBases: selectedKnowledgeBasesForSubmit,
        activeKnowledgeBase: activeKnowledgeBaseForSubmit,
        kb_id: activeKnowledgeBaseForSubmit?.kb_id ?? null,
        knowledgeBaseId: activeKnowledgeBaseForSubmit?.knowledgeBaseId ?? activeKnowledgeBaseForSubmit?.kbId ?? activeKnowledgeBaseForSubmit?.kb_id ?? null,
        expert_id: activeKnowledgeBaseForSubmit?.expert_id ?? null,
        agentId: activeKnowledgeBaseForSubmit?.agentId ?? activeKnowledgeBaseForSubmit?.expertId ?? activeKnowledgeBaseForSubmit?.expert_id ?? null,
        tenant_id: activeKnowledgeBaseForSubmit?.tenant_id ?? null,
        namespace: activeKnowledgeBaseForSubmit?.namespace ?? activeKnowledgeBaseForSubmit?.tenant_id ?? null
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
                finalized_answer: streamResult.finalized_answer ?? null,
                provider_status: streamResult.provider_status ?? null,
                sources: streamResult.sources,
                confidence: streamResult.confidence,
                metadata: {
                  ...currentMetadata,
                  finalizedAnswer: streamResult.finalized_answer ?? currentMetadata.finalizedAnswer,
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
        setManualChatMode(submittedManualChatMode);
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

  async function handleCopyLinkDialog(selectionElement?: HTMLInputElement | null) {
    if (!linkDialog) {
      return;
    }

    clearActionFeedback();

    const copied = await safeCopyText(linkDialog.link, { selectionElement });

    if (copied) {
      setLinkDialog((current) => current ? { ...current, copied: true } : current);
      setActionSuccess(linkDialog.copySuccessMessage, "copy");
      return;
    }

    setLinkDialog((current) => current ? { ...current, copied: false } : current);
    setLinkCopyFailureSignal((value) => value + 1);
    setActionError("浏览器限制了自动复制，链接已选中，请按 Ctrl+C 复制。", "copy");
  }

  function handleCloseLinkDialog() {
    setLinkDialog(null);
    setActionFeedback(null);
    setLinkActionBusy(false);
  }

  const actionFeedbackClassName = actionFeedback?.type === "error"
    ? "border-red-100 bg-red-50 text-red-700"
    : actionFeedback?.type === "success"
      ? "border-emerald-100 bg-emerald-50 text-emerald-700"
      : "border-blue-100 bg-blue-50 text-blue-700";
  const linkDialogFeedback = linkDialog && actionFeedback && (
    actionFeedback.kind === linkDialog.kind ||
    actionFeedback.kind === "copy"
  )
    ? actionFeedback
    : null;
  const linkDialogMessage = linkDialogFeedback?.type && linkDialogFeedback.type !== "error"
    ? (linkDialog?.copied ? linkDialog.copySuccessMessage : linkDialogFeedback.message)
    : null;
  const linkDialogError = linkDialogFeedback?.type === "error"
    ? linkDialogFeedback.message
    : null;

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
          {actionFeedback?.message ? (
            <div className={cn("mx-4 mt-3 rounded-2xl border px-4 py-3 text-sm", actionFeedbackClassName)}>
              {actionFeedback.message}
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
                userName={currentUserName}
                userAvatarUrl={currentAvatarUrl}
              />
            )}
          </div>

          <ChatQuickActions
            decision={finalChatModeDecision}
            manualMode={manualChatMode}
            onToggleManualMode={handleToggleManualChatMode}
          />

          <PromptKnowledgeBar
            items={selectedKnowledgeBases}
            onActivate={handleActivateKnowledgeBase}
          />

          <ChatInput
            value={input}
            loading={loading}
            onValueChange={handleInputChange}
            onSubmit={handleSubmit}
            onCancel={abortActiveAsk}
            onStatusMessage={showNotice}
            onAttachmentsChange={setInputAttachments}
            placeholder={inputPlaceholder}
            knowledgeBaseSelector={(
              <KnowledgeBaseSelector
                selectedCount={selectedKnowledgeBases.length}
                activeTitle={activeKnowledgeBase?.title ?? null}
                onOpen={() => setExpertMarketOpen(true)}
              />
            )}
          />
          <ExpertMarketDrawer
            open={expertMarketOpen}
            selected={selectedKnowledgeBases}
            onAdd={handleAddKnowledgeBase}
            onRemove={handleRemoveKnowledgeBase}
            onClose={() => setExpertMarketOpen(false)}
          />
          <LinkActionDialog
            open={Boolean(linkDialog)}
            title={linkDialog?.title ?? ""}
            link={linkDialog?.link ?? ""}
            description={linkDialog?.description ?? ""}
            copyLabel={linkDialog?.kind === "share" ? "复制分享链接" : "复制群组链接"}
            selectSignal={linkCopyFailureSignal}
            busy={linkActionBusy}
            message={linkDialogMessage}
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
