"use client";

import * as React from "react";
import { ArrowDown, Menu, Plus } from "lucide-react";
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
  chatConversationRunReducer,
  createDraftConversationId,
  createEmptyChatConversationRunState,
  createNewChatState,
  createUserMessage,
  getLatestChatConversationRun,
  getLatestChatConversationRuns,
  getChatUserAvatarStorageKey,
  getCurrentChatUserAvatarUrl,
  getCurrentChatUserDisplayAccount,
  getCurrentChatUserDisplayName,
  isChatConversationRunBusy,
  isDraftConversationId,
  mergeConversationHistoryWithRun,
  normalizeCurrentChatUserAvatarUrl,
  normalizeChatMode,
  updateChatConversationRunMessages,
  type ChatConversationRunAction,
  type ChatConversationRunState
} from "../chat-ui-state";
import {
  detectChatMode,
  resolveFinalChatMode,
  type ChatModeDecision,
  type ChatModeKey
} from "../lib/intent-mode-router";
import { safeCopyTextDetailed } from "../lib/clipboard";
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
const PROMPT_HISTORY_LIMIT = 30;
const PROMPT_HISTORY_RAIL_MARK_COUNT = 42;
const CHAT_MODE_CLASSIFY_CACHE_PREFIX = "chat-ui:mode-classify:v12.5:";
const CHAT_SCROLL_BOTTOM_THRESHOLD = 96;
const CHAT_MESSAGE_TOP_OFFSET = 16;
const CHAT_MESSAGE_TOP_TOLERANCE = 8;
const IMAGE_ONLY_DEFAULT_PROMPT = "请识别图片内容并给出回复建议。";

function createChatRunRequestId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createOptimisticConversationTitle(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();

  return normalized.slice(0, 28) || "新会话";
}

type LoadConversationsOptions = {
  background?: boolean;
  force?: boolean;
};

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

type PromptHistoryItem = {
  messageId: string;
  prompt: string;
};

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

function normalizeAvatarUrl(avatarUrl: string | null | undefined) {
  const value = normalizeCurrentChatUserAvatarUrl(avatarUrl);

  if (!value || /^(?:https?:|data:|blob:|\/)/i.test(value)) {
    return value;
  }

  return `/${value.replace(/^\/+/, "")}`;
}

function buildPromptHistoryItems(messages: ChatMessageView[]): PromptHistoryItem[] {
  return messages
    .filter((message) => message.role === "user" && message.content.trim().length > 0)
    .map((message) => ({
      messageId: message.id,
      prompt: message.content.trim()
    }))
    .reverse()
    .slice(0, PROMPT_HISTORY_LIMIT);
}

function readStoredAvatarUrl(user: CurrentChatUser | null | undefined) {
  if (typeof window === "undefined" || !user) {
    return null;
  }

  try {
    return normalizeAvatarUrl(window.localStorage.getItem(getChatUserAvatarStorageKey(user)));
  } catch {
    return null;
  }
}

function writeStoredAvatarUrl(user: CurrentChatUser | null | undefined, avatarUrl: string | null) {
  if (typeof window === "undefined" || !user) {
    return;
  }

  try {
    const storageKey = getChatUserAvatarStorageKey(user);
    const nextAvatarUrl = normalizeAvatarUrl(avatarUrl);

    if (nextAvatarUrl) {
      window.localStorage.setItem(storageKey, nextAvatarUrl);
      return;
    }

    window.localStorage.removeItem(storageKey);
  } catch {
    // Avatar persistence is mirrored by the API; local storage is only an immediate UI fallback.
  }
}

function mergeCurrentUserAvatar(user: CurrentChatUser, avatarUrl: string | null): CurrentChatUser {
  const nextAvatarUrl = normalizeAvatarUrl(avatarUrl);

  return {
    ...user,
    avatar_url: nextAvatarUrl,
    avatarUrl: nextAvatarUrl,
    avatar: nextAvatarUrl,
    profile_image: nextAvatarUrl,
    profileImage: nextAvatarUrl,
    image: nextAvatarUrl
  };
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

function isChatScrollNearBottom(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= CHAT_SCROLL_BOTTOM_THRESHOLD;
}

function getChatMessageScrollTop(container: HTMLElement, target: HTMLElement) {
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();

  return Math.max(0, container.scrollTop + targetRect.top - containerRect.top - CHAT_MESSAGE_TOP_OFFSET);
}

function isChatMessagePinnedToTop(container: HTMLElement, target: HTMLElement) {
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const distance = Math.abs(targetRect.top - containerRect.top - CHAT_MESSAGE_TOP_OFFSET);

  return distance <= CHAT_MESSAGE_TOP_TOLERANCE;
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

function PromptHistoryRail({
  prompts,
  onSelect
}: {
  prompts: PromptHistoryItem[];
  onSelect: (item: PromptHistoryItem) => void;
}) {
  const [promptHistoryPanelOpen, setPromptHistoryPanelOpen] = React.useState(false);

  if (prompts.length === 0) {
    return null;
  }

  function handlePromptHistoryBlur(event: React.FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget;

    if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
      setPromptHistoryPanelOpen(false);
    }
  }

  return (
    <aside
      aria-label="提示词记录栏"
      className="pointer-events-none absolute bottom-32 right-3 top-24 z-20 hidden lg:block"
    >
      <div
        className="pointer-events-auto relative flex h-full w-10 items-center justify-center"
        onBlur={handlePromptHistoryBlur}
        onFocus={() => setPromptHistoryPanelOpen(true)}
        onMouseEnter={() => setPromptHistoryPanelOpen(true)}
        onMouseLeave={() => setPromptHistoryPanelOpen(false)}
      >
        <button
          type="button"
          onClick={() => setPromptHistoryPanelOpen(true)}
          onFocus={() => setPromptHistoryPanelOpen(true)}
          onMouseEnter={() => setPromptHistoryPanelOpen(true)}
          onPointerEnter={() => setPromptHistoryPanelOpen(true)}
          className="focus-ring flex h-[min(62vh,520px)] w-8 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-slate-400 shadow-sm shadow-slate-200/70 transition hover:border-slate-300 hover:bg-white hover:text-slate-700"
          aria-label="提示词记录条"
          title="提示词记录"
        >
          <span className="flex h-[calc(100%-28px)] w-3 flex-col items-center justify-between" aria-hidden="true">
            {Array.from({ length: PROMPT_HISTORY_RAIL_MARK_COUNT }).map((_, index) => (
              <span
                key={index}
                className={cn(
                  "h-px w-2 rounded-full bg-slate-300",
                  index >= PROMPT_HISTORY_RAIL_MARK_COUNT - 4 ? "bg-slate-950" : null
                )}
              />
            ))}
          </span>
        </button>
        <div
          className={cn(
            "pointer-events-auto absolute right-10 top-1/2 max-h-[min(70vh,560px)] w-80 -translate-y-1/2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-300/50",
            promptHistoryPanelOpen ? "block" : "hidden"
          )}
        >
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="text-sm font-semibold text-slate-900">提示词记录</div>
            <div className="mt-1 text-xs text-slate-500">移动到右侧记录栏可查看，点击可定位到对应提示词。</div>
          </div>
          <div className="max-h-[calc(min(70vh,560px)-72px)] space-y-2 overflow-y-auto p-3">
            {prompts.map((item, index) => (
              <button
                key={item.messageId}
                type="button"
                onClick={() => {
                  onSelect(item);
                  setPromptHistoryPanelOpen(false);
                }}
                className="focus-ring flex w-full gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-left text-xs text-slate-700 transition hover:border-blue-100 hover:bg-blue-50 hover:text-slate-950"
                title={item.prompt}
              >
                <span className="mt-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-white text-[10px] font-semibold text-slate-500">
                  {index + 1}
                </span>
                <span
                  className="min-w-0 flex-1 overflow-hidden leading-5"
                  style={{
                    display: "-webkit-box",
                    WebkitBoxOrient: "vertical",
                    WebkitLineClamp: 2
                  }}
                >
                  {item.prompt}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

export function ChatShell() {
  const [mode, setMode] = React.useState<ChatMode>("fast");
  const [enableDeepThinking] = React.useState(false);
  const [enableWebSearch] = React.useState(false);
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [conversations, setConversations] = React.useState<ChatConversation[]>([]);
  const [pinnedConversationIds, setPinnedConversationIds] = React.useState<Set<string>>(() => new Set());
  const [messages, setMessages] = React.useState<ChatMessageView[]>([]);
  const [conversationRunState, setConversationRunState] = React.useState<ChatConversationRunState>(() => (
    createEmptyChatConversationRunState()
  ));
  const [input, setInput] = React.useState("");
  const [inputAttachments, setInputAttachments] = React.useState<ChatAttachmentDraft[]>([]);
  const [manualChatMode, setManualChatMode] = React.useState<ChatModeKey | null>(null);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [conversationLoading, setConversationLoading] = React.useState(true);
  const [conversationLoadError, setConversationLoadError] = React.useState<string | null>(null);
  const [historyLoadError, setHistoryLoadError] = React.useState<string | null>(null);
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
  const [showScrollToBottom, setShowScrollToBottom] = React.useState(false);
  const [scrollFocusMessageId, setScrollFocusMessageId] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const historyRequestIdRef = React.useRef(0);
  const conversationListRequestIdRef = React.useRef(0);
  const conversationListAbortRef = React.useRef<AbortController | null>(null);
  const conversationListInFlightRef = React.useRef(false);
  const conversationListHasSucceededRef = React.useRef(false);
  const conversationLoadErrorRef = React.useRef<string | null>(null);
  const activeConversationIdRef = React.useRef<string | null>(null);
  const conversationRunStateRef = React.useRef<ChatConversationRunState>(conversationRunState);
  const askControllerByRequestIdRef = React.useRef(new Map<string, AbortController>());
  const historyAbortRef = React.useRef<AbortController | null>(null);
  const chatModeClassifyAbortRef = React.useRef<AbortController | null>(null);
  const activeUserIdentityRef = React.useRef<string | null>(null);
  const pendingScrollToUserMessageIdRef = React.useRef<string | null>(null);
  const pendingScrollToBottomRef = React.useRef(false);
  const currentUserName = getCurrentChatUserDisplayName(currentUser);
  const currentUserAccount = getCurrentChatUserDisplayAccount(currentUser);
  const currentUserIdentity = getChatUserStorageIdentity(currentUser);
  const pinnedConversationStorageKey = getPinnedConversationStorageKey(currentUser);
  const activeConversationRun = React.useMemo(() => (
    getLatestChatConversationRun(conversationRunState, conversationId)
  ), [conversationId, conversationRunState]);
  const visibleMessages = activeConversationRun?.messages ?? messages;
  const loading = isChatConversationRunBusy(activeConversationRun);
  const promptHistory = React.useMemo(() => buildPromptHistoryItems(visibleMessages), [visibleMessages]);
  const visibleConversations = React.useMemo(() => {
    const latestRuns = getLatestChatConversationRuns(conversationRunState);
    const runByViewId = new Map(latestRuns.map((run) => [run.viewId, run]));
    const mergedConversations = conversations.map((conversation) => {
      const run = runByViewId.get(conversation.id);

      if (!run) {
        return conversation;
      }

      return {
        ...conversation,
        metadata: {
          ...(conversation.metadata ?? {}),
          localConversationRun: true,
          localDraft: false,
          localRunPhase: run.phase
        },
        updated_at: new Date(run.updatedAt).toISOString()
      };
    });
    const knownConversationIds = new Set(mergedConversations.map((conversation) => conversation.id));

    for (const run of latestRuns) {
      if (knownConversationIds.has(run.viewId)) {
        continue;
      }

      mergedConversations.push({
        id: run.viewId,
        title: run.title,
        mode: run.mode,
        metadata: {
          localConversationRun: true,
          localDraft: isDraftConversationId(run.viewId),
          localRunPhase: run.phase
        },
        message_count: run.messages.length,
        created_at: new Date(run.startedAt).toISOString(),
        updated_at: new Date(run.updatedAt).toISOString()
      });
      knownConversationIds.add(run.viewId);
    }

    const originalIndex = new Map(mergedConversations.map((conversation, index) => [conversation.id, index]));

    return mergedConversations.sort((left, right) => {
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
  }, [conversationRunState, conversations, pinnedConversationIds]);
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
  const inputPlaceholder = "问问 小董AI";

  const setActiveConversationView = React.useCallback((nextConversationId: string | null) => {
    activeConversationIdRef.current = nextConversationId;
    setConversationId(nextConversationId);
  }, []);

  const applyConversationRunAction = React.useCallback((action: ChatConversationRunAction) => {
    const currentState = conversationRunStateRef.current;
    const nextState = chatConversationRunReducer(currentState, action);

    if (nextState === currentState) {
      return currentState;
    }

    conversationRunStateRef.current = nextState;
    setConversationRunState(nextState);
    return nextState;
  }, []);

  const updateConversationRunMessages = React.useCallback((
    requestId: string,
    updater: (current: ChatMessageView[]) => ChatMessageView[]
  ) => {
    const nextState = updateChatConversationRunMessages(
      conversationRunStateRef.current,
      requestId,
      updater
    );

    if (nextState !== conversationRunStateRef.current) {
      conversationRunStateRef.current = nextState;
      setConversationRunState(nextState);
    }

    return nextState.byRequestId[requestId] ?? null;
  }, []);

  const refreshCurrentUser = React.useCallback(async (options: { cacheBust?: boolean } = {}) => {
    const result = await fetchCurrentChatUser(options);
    const remoteAvatarUrl = normalizeAvatarUrl(getCurrentChatUserAvatarUrl(result.user));
    const storedAvatarUrl = readStoredAvatarUrl(result.user);
    const nextAvatarUrl = storedAvatarUrl || remoteAvatarUrl;
    const nextUser = mergeCurrentUserAvatar(result.user, nextAvatarUrl);

    setCurrentUser(nextUser);
    setCurrentAvatarUrl(nextAvatarUrl);
    return nextUser;
  }, []);

  const loadConversations = React.useCallback(async (options: LoadConversationsOptions = {}) => {
    if (conversationListInFlightRef.current && !options.force) {
      return;
    }

    if (options.force) {
      conversationListAbortRef.current?.abort();
    }

    const requestId = conversationListRequestIdRef.current + 1;
    const controller = new AbortController();
    const background = options.background ?? conversationListHasSucceededRef.current;

    conversationListRequestIdRef.current = requestId;
    conversationListAbortRef.current = controller;
    conversationListInFlightRef.current = true;
    conversationLoadErrorRef.current = null;

    if (!background) {
      setConversationLoading(true);
    }

    setConversationLoadError(null);

    try {
      const result = await fetchConversations({ signal: controller.signal });

      if (conversationListRequestIdRef.current !== requestId) {
        return;
      }

      conversationListHasSucceededRef.current = true;
      setConversations(result.conversations);
    } catch (requestError) {
      if (
        conversationListRequestIdRef.current !== requestId ||
        (requestError instanceof DOMException && requestError.name === "AbortError")
      ) {
        return;
      }

      console.warn("[chat-ui] conversation list load failed", requestError);
      const loadError = "历史会话暂时无法加载，请稍后重试。";

      conversationLoadErrorRef.current = loadError;
      setConversationLoadError(loadError);
    } finally {
      if (conversationListRequestIdRef.current === requestId) {
        conversationListAbortRef.current = null;
        conversationListInFlightRef.current = false;
        setConversationLoading(false);
      }
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
      conversationListAbortRef.current?.abort();
      conversationListAbortRef.current = null;
      conversationListRequestIdRef.current += 1;
      conversationListInFlightRef.current = false;
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

    void loadConversations({ force: previousUserIdentity !== nextUserIdentity });
    // Session cleanup is intentionally driven only by authenticated identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserLoaded, currentUserIdentity, pinnedConversationStorageKey, loadConversations]);

  React.useEffect(() => {
    if (!currentUserLoaded || !currentUserIdentity) {
      return;
    }

    function recoverConversationList() {
      if (
        !conversationLoadErrorRef.current ||
        conversationListInFlightRef.current ||
        navigator.onLine === false
      ) {
        return;
      }

      void loadConversations({
        background: conversationListHasSucceededRef.current
      });
    }

    function handleConversationListVisibilityChange() {
      if (document.visibilityState === "visible") {
        recoverConversationList();
      }
    }

    window.addEventListener("online", recoverConversationList);
    window.addEventListener("pageshow", recoverConversationList);
    document.addEventListener("visibilitychange", handleConversationListVisibilityChange);

    return () => {
      window.removeEventListener("online", recoverConversationList);
      window.removeEventListener("pageshow", recoverConversationList);
      document.removeEventListener("visibilitychange", handleConversationListVisibilityChange);
    };
  }, [currentUserIdentity, currentUserLoaded, loadConversations]);

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

    const storedAvatarUrl = readStoredAvatarUrl(currentUser);
    const remoteAvatarUrl = normalizeAvatarUrl(getCurrentChatUserAvatarUrl(currentUser));

    setCurrentAvatarUrl(storedAvatarUrl || remoteAvatarUrl);
  }, [currentUser]);

  const updateScrollToBottomVisibility = React.useCallback(() => {
    const scrollContainer = scrollRef.current;

    setShowScrollToBottom(Boolean(
      scrollContainer &&
      visibleMessages.length > 0 &&
      !isChatScrollNearBottom(scrollContainer)
    ));
  }, [visibleMessages.length]);

  const scrollChatToBottom = React.useCallback((behavior: ScrollBehavior = "smooth") => {
    const scrollContainer = scrollRef.current;

    if (!scrollContainer) {
      return;
    }

    scrollContainer.scrollTo({
      top: scrollContainer.scrollHeight,
      behavior
    });
    setShowScrollToBottom(false);
  }, []);

  const scrollChatMessageToTop = React.useCallback((messageId: string, behavior: ScrollBehavior = "smooth") => {
    const scrollContainer = scrollRef.current;

    if (!scrollContainer) {
      return false;
    }

    const target = Array.from(scrollContainer.querySelectorAll<HTMLElement>("[data-chat-message-id]"))
      .find((element) => element.dataset.chatMessageId === messageId);

    if (!target) {
      return false;
    }

    const desiredTop = getChatMessageScrollTop(scrollContainer, target);
    const maxTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);

    scrollContainer.scrollTo({
      top: Math.min(desiredTop, maxTop),
      behavior
    });
    window.requestAnimationFrame(updateScrollToBottomVisibility);

    return desiredTop <= maxTop + CHAT_MESSAGE_TOP_TOLERANCE || isChatMessagePinnedToTop(scrollContainer, target);
  }, [updateScrollToBottomVisibility]);

  React.useEffect(() => {
    const scrollContainer = scrollRef.current;

    if (!scrollContainer) {
      return undefined;
    }

    updateScrollToBottomVisibility();
    scrollContainer.addEventListener("scroll", updateScrollToBottomVisibility, { passive: true });
    window.addEventListener("resize", updateScrollToBottomVisibility);

    return () => {
      scrollContainer.removeEventListener("scroll", updateScrollToBottomVisibility);
      window.removeEventListener("resize", updateScrollToBottomVisibility);
    };
  }, [updateScrollToBottomVisibility]);

  React.useEffect(() => {
    const targetMessageId = pendingScrollToUserMessageIdRef.current;

    if (targetMessageId) {
      setScrollFocusMessageId((current) => current ?? targetMessageId);

      if (scrollChatMessageToTop(targetMessageId, "auto")) {
        pendingScrollToUserMessageIdRef.current = null;
        return undefined;
      }

      const frame = window.requestAnimationFrame(() => {
        if (scrollChatMessageToTop(targetMessageId, "auto")) {
          pendingScrollToUserMessageIdRef.current = null;
        }
      });

      return () => window.cancelAnimationFrame(frame);
    }

    if (pendingScrollToBottomRef.current) {
      pendingScrollToBottomRef.current = false;
      scrollChatToBottom("auto");
      return undefined;
    }

    const frame = window.requestAnimationFrame(updateScrollToBottomVisibility);

    return () => window.cancelAnimationFrame(frame);
  }, [visibleMessages, scrollFocusMessageId, scrollChatMessageToTop, scrollChatToBottom, updateScrollToBottomVisibility]);

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(updateScrollToBottomVisibility);

    return () => window.cancelAnimationFrame(frame);
  }, [loading, updateScrollToBottomVisibility, visibleMessages]);

  React.useEffect(() => {
    if (loading || !scrollFocusMessageId || pendingScrollToUserMessageIdRef.current) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setScrollFocusMessageId((current) => (current === scrollFocusMessageId ? null : current));
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [loading, scrollFocusMessageId]);

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
    activeConversationIdRef.current = null;
    conversationRunStateRef.current = createEmptyChatConversationRunState();
    askControllerByRequestIdRef.current.forEach((controller) => controller.abort());
    askControllerByRequestIdRef.current.clear();
    historyAbortRef.current?.abort();
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
    const activeRun = getLatestChatConversationRun(
      conversationRunStateRef.current,
      activeConversationIdRef.current
    );
    const activeController = activeRun
      ? askControllerByRequestIdRef.current.get(activeRun.requestId)
      : null;

    if (!activeController) {
      return;
    }

    activeController.abort();
    showNotice(message);
  }

  function clearChatSessionState(options: { clearPinned?: boolean } = {}) {
    askControllerByRequestIdRef.current.forEach((controller) => controller.abort());
    askControllerByRequestIdRef.current.clear();
    historyAbortRef.current?.abort();
    historyAbortRef.current = null;
    applyConversationRunAction({ type: "run/clear" });
    conversationListAbortRef.current?.abort();
    conversationListAbortRef.current = null;
    conversationListRequestIdRef.current += 1;
    conversationListInFlightRef.current = false;
    conversationListHasSucceededRef.current = false;
    conversationLoadErrorRef.current = null;
    pendingScrollToUserMessageIdRef.current = null;
    pendingScrollToBottomRef.current = false;
    setScrollFocusMessageId(null);
    historyRequestIdRef.current += 1;
    setActiveConversationView(null);
    setConversations([]);
    setMessages([]);
    setInput("");
    setInputAttachments([]);
    setManualChatMode(null);
    setClassifiedChatModeDecision(null);
    setHistoryLoading(false);
    setConversationLoading(false);
    setConversationLoadError(null);
    setHistoryLoadError(null);
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
    historyAbortRef.current?.abort();
    historyAbortRef.current = null;
    pendingScrollToUserMessageIdRef.current = null;
    setScrollFocusMessageId(null);
    const requestId = historyRequestIdRef.current + 1;
    const activeRun = getLatestChatConversationRun(
      conversationRunStateRef.current,
      nextConversationId
    );

    historyRequestIdRef.current = requestId;
    setError(activeRun?.error ?? null);
    setHistoryLoadError(null);
    setActionFeedback(null);
    setActiveConversationView(nextConversationId);
    setMode(activeRun?.mode ?? mode);
    closeSidebarAfterNavigation();

    if (isDraftConversationId(nextConversationId)) {
      setHistoryLoading(false);
      setMessages([]);
      return;
    }

    const controller = new AbortController();
    historyAbortRef.current = controller;
    setHistoryLoading(!activeRun);

    if (!activeRun) {
      setMessages([]);
    }

    try {
      const history = await fetchConversationHistory(nextConversationId, {
        signal: controller.signal
      });

      if (
        controller.signal.aborted ||
        historyRequestIdRef.current !== requestId ||
        activeConversationIdRef.current !== nextConversationId
      ) {
        return;
      }

      const latestRun = getLatestChatConversationRun(
        conversationRunStateRef.current,
        nextConversationId
      );
      const mergedHistory = mergeConversationHistoryWithRun({
        historyMessages: Array.isArray(history.messages) ? history.messages : [],
        run: latestRun
      });

      setMode(latestRun?.mode ?? normalizeChatMode(history.conversation.mode));
      pendingScrollToBottomRef.current = true;
      setMessages(mergedHistory.messages);

      if (mergedHistory.dropRequestId) {
        applyConversationRunAction({
          type: "run/drop",
          requestId: mergedHistory.dropRequestId
        });
      }
    } catch (historyError) {
      if (historyError instanceof DOMException && historyError.name === "AbortError") {
        return;
      }

      if (
        historyRequestIdRef.current !== requestId ||
        activeConversationIdRef.current !== nextConversationId
      ) {
        return;
      }

      if (!getLatestChatConversationRun(conversationRunStateRef.current, nextConversationId)) {
        setHistoryLoadError("历史记录暂时无法加载，请稍后重试。");
        setMessages([]);
      }
    } finally {
      if (historyRequestIdRef.current === requestId) {
        setHistoryLoading(false);
      }

      if (historyAbortRef.current === controller) {
        historyAbortRef.current = null;
      }
    }
  }

  function handleNewChat() {
    historyAbortRef.current?.abort();
    historyAbortRef.current = null;
    const nextState = createNewChatState();

    historyRequestIdRef.current += 1;
    pendingScrollToUserMessageIdRef.current = null;
    pendingScrollToBottomRef.current = false;
    setScrollFocusMessageId(null);
    setHistoryLoading(false);
    setActiveConversationView(nextState.conversationId);
    setMessages(nextState.messages);
    setInput(nextState.input);
    setInputAttachments([]);
    setManualChatMode(null);
    setHistoryLoadError(null);
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
    requestId: string,
    messageId: string,
    updater: (metadata: Record<string, unknown>) => Record<string, unknown>
  ) {
    updateConversationRunMessages(requestId, (current) => current.map((message) => (
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

    if (actionLabel === "分享") {
      return `分享失败：${cleanMessage || "当前会话暂时无法分享，请稍后再试。"}`;
    }

    if (actionLabel === "开始群聊") {
      return `开始群聊失败：${cleanMessage || "当前会话暂时无法创建群聊链接，请稍后再试。"}`;
    }

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
    const immediateAvatarUrl = normalizeAvatarUrl(nextAvatarUrl);

    writeStoredAvatarUrl(currentUser, immediateAvatarUrl);
    setCurrentAvatarUrl(immediateAvatarUrl);
    setCurrentUser((user) => (user ? mergeCurrentUserAvatar(user, immediateAvatarUrl) : user));
    void refreshCurrentUser({ cacheBust: true })
      .then((user) => {
        const refreshedAvatarUrl = normalizeAvatarUrl(getCurrentChatUserAvatarUrl(user));
        const stableAvatarUrl = immediateAvatarUrl === null ? null : immediateAvatarUrl || readStoredAvatarUrl(user) || refreshedAvatarUrl;

        writeStoredAvatarUrl(user, stableAvatarUrl);
        setCurrentAvatarUrl(stableAvatarUrl);
        setCurrentUser((current) => mergeCurrentUserAvatar({
          ...(current ?? user),
          ...user
        }, stableAvatarUrl));
      })
      .catch((requestError) => {
        console.warn("[chat-ui] refresh current user after avatar save failed", requestError);
      });
    setActionSuccess(immediateAvatarUrl ? "头像已更新。" : "已恢复默认头像。", "avatar");
  }

  function handlePromptHistorySelect(item: PromptHistoryItem) {
    setScrollFocusMessageId(item.messageId);

    if (scrollChatMessageToTop(item.messageId, "smooth")) {
      showNotice("已定位到对应提示词。");
      return;
    }

    showNotice("这条提示词暂时无法定位，请稍后再试。");
  }

  async function submitText(text: string, attachments: ChatAttachmentDraft[] = []) {
    const hasImageAttachment = attachments.some(isImageLikeAttachment);
    const canSubmit = Boolean(text) || hasImageAttachment;

    if (!canSubmit || loading) {
      if (!text && attachments.length > 0) {
        showNotice("请先输入问题，或选择图片后直接发送。");
      }

      return false;
    }

    const askText = text || IMAGE_ONLY_DEFAULT_PROMPT;
    const requestId = createChatRunRequestId();
    const sourceConversationId = conversationId && !isDraftConversationId(conversationId)
      ? conversationId
      : null;
    const sourceViewId = conversationId && isDraftConversationId(conversationId)
      ? conversationId
      : sourceConversationId ?? createDraftConversationId(requestId);
    const submittedMode = mode;
    const submittedManualChatMode = manualChatMode;
    const submittedFinalChatModeDecision = finalChatModeDecision;
    const selectedKnowledgeBasesForSubmit = selectedKnowledgeBases;
    const activeKnowledgeBaseForSubmit = activeKnowledgeBase;
    const hasPreviousAssistantResponse = visibleMessages.some((message) => (
      message.role === "assistant" &&
      !message.pending &&
      message.content.trim().length > 0
    ));
    const abortController = new AbortController();
    const optimisticUserMessage: ChatMessageView = {
      ...createUserMessage(text, attachments),
      id: `local-user-${requestId}`
    };
    const optimisticAssistantMessage: ChatMessageView = {
      id: `local-assistant-${requestId}`,
      role: "assistant",
      content: "",
      sources: null,
      confidence: null,
      customer_answer: null,
      provider_status: null,
      metadata: {},
      created_at: "",
      pending: true
    };
    const optimisticMessages = [
      ...visibleMessages,
      optimisticUserMessage,
      optimisticAssistantMessage
    ];

    setError(null);
    setActionFeedback(null);
    applyConversationRunAction({
      type: "run/start",
      run: {
        requestId,
        viewId: sourceViewId,
        serverConversationId: sourceConversationId,
        phase: "uploading",
        mode: submittedMode,
        messages: optimisticMessages,
        localUserMessageId: optimisticUserMessage.id,
        localAssistantMessageId: optimisticAssistantMessage.id,
        finalMessageId: null,
        title: createOptimisticConversationTitle(askText),
        error: null,
        startedAt: Date.now(),
        updatedAt: Date.now()
      }
    });
    askControllerByRequestIdRef.current.set(requestId, abortController);

    if (!sourceConversationId) {
      setActiveConversationView(sourceViewId);
    }

    pendingScrollToUserMessageIdRef.current = optimisticUserMessage.id;
    setScrollFocusMessageId(optimisticUserMessage.id);
    setInput("");
    setInputAttachments([]);
    setManualChatMode(null);

    try {
      const uploadedAttachments = await uploadChatAttachments(attachments);

      if (abortController.signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      const submitModeDecision = submittedManualChatMode
        ? resolveFinalChatMode({
          ruleDecision: detectChatMode({
            text: askText,
            hasImage: uploadedAttachments.some(isImageLikeAttachment),
            hasAttachment: uploadedAttachments.length > 0
          }),
          manualMode: submittedManualChatMode
        })
        : submittedFinalChatModeDecision;
      const commercialExecution = detectUserIntent(askText);
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

      const nextUserMessage: ChatMessageView = {
        ...optimisticUserMessage,
        attachments: uploadedAttachments,
        metadata: {
          commercialExecution,
          businessExecution,
          finalChatModeDecision: submitModeDecision,
          knowledgeSelection: knowledgeSelectionMetadata
        }
      };
      const nextAssistantMessage: ChatMessageView = {
        ...optimisticAssistantMessage,
        metadata: {
          commercialExecution,
          businessExecution,
          businessExecutionPrompt,
          finalChatModeDecision: submitModeDecision,
          knowledgeSelection: knowledgeSelectionMetadata
        },
      };

      updateConversationRunMessages(requestId, (current) => current.map((message) => {
        if (message.id === optimisticUserMessage.id) {
          return nextUserMessage;
        }

        if (message.id === optimisticAssistantMessage.id) {
          return nextAssistantMessage;
        }

        return message;
      }));
      applyConversationRunAction({
        type: "run/mark-generating",
        requestId,
        mode: submittedMode,
        updatedAt: Date.now()
      });

      await askChatStream({
        text: askText,
        attachments: uploadedAttachments,
        conversation_id: sourceConversationId,
        mode: submittedMode,
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
          updateAssistantMessageMetadata(requestId, nextAssistantMessage.id, (metadata) => ({
            ...metadata,
            streamThinking: content
          }));
        },
        onRagSearch: (query) => {
          updateAssistantMessageMetadata(requestId, nextAssistantMessage.id, (metadata) => ({
            ...metadata,
            ragVisualization: {
              ...getMetadataRecord(metadata, "ragVisualization"),
              query,
              status: "searching"
            }
          }));
        },
        onRagChunk: (event) => {
          updateAssistantMessageMetadata(requestId, nextAssistantMessage.id, (metadata) => {
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
          updateAssistantMessageMetadata(requestId, nextAssistantMessage.id, (metadata) => {
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
          updateAssistantMessageMetadata(requestId, nextAssistantMessage.id, (metadata) => {
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
                    chunk_id: event.chunk_id ?? null,
                    item_id: event.item_id ?? null,
                    knowledgeBaseId: event.knowledgeBaseId ?? null,
                    agentId: event.agentId ?? null,
                    tenantId: event.tenantId ?? null,
                    namespace: event.namespace ?? null,
                    sourceApp: event.sourceApp ?? null,
                    includeShared: event.includeShared ?? null,
                    includePublished: event.includePublished ?? null
                  }
                ]
              }
            };
          });
        },
        onRagDone: (event) => {
          updateAssistantMessageMetadata(requestId, nextAssistantMessage.id, (metadata) => ({
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
          updateAssistantMessageMetadata(requestId, nextAssistantMessage.id, (metadata) => ({
            ...metadata,
            modelVisualization: {
              ...getMetadataRecord(metadata, "modelVisualization"),
              selected_model: model
            }
          }));
        },
        onModelReason: (reason) => {
          updateAssistantMessageMetadata(requestId, nextAssistantMessage.id, (metadata) => ({
            ...metadata,
            modelVisualization: {
              ...getMetadataRecord(metadata, "modelVisualization"),
              reason
            }
          }));
        },
        onModelFallback: (chain) => {
          updateAssistantMessageMetadata(requestId, nextAssistantMessage.id, (metadata) => ({
            ...metadata,
            modelVisualization: {
              ...getMetadataRecord(metadata, "modelVisualization"),
              fallback_chain: chain
            }
          }));
        },
        onModelMetrics: (event: Extract<AskChatStreamEvent, { type: "model_metrics" }>) => {
          updateAssistantMessageMetadata(requestId, nextAssistantMessage.id, (metadata) => ({
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
          updateConversationRunMessages(requestId, (current) => current.map((message) => (
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
          const currentRun = conversationRunStateRef.current.byRequestId[requestId];
          const normalizedMode = normalizeChatMode(streamResult.mode);
          const completedMessages: ChatMessageView[] = (
            currentRun?.messages ?? [nextUserMessage, nextAssistantMessage]
          ).map((message): ChatMessageView => {
            if (message.id === nextUserMessage.id) {
              return {
                ...message,
                pending: false
              };
            }

            if (message.id === nextAssistantMessage.id) {
              const currentMetadata = message.metadata ?? {};
              const resolvedAnswer =
                streamResult.rawAnswerBeforeFinalizer ||
                streamResult.rawContent ||
                streamResult.rawText ||
                streamResult.rawAnswer ||
                streamResult.answer ||
                "";
              const rawAnswerForDisplay =
                streamResult.rawAnswerBeforeFinalizer ??
                streamResult.rawContent ??
                streamResult.rawText ??
                streamResult.rawAnswer ??
                resolvedAnswer;

              return {
                id: streamResult.message_id,
                role: "assistant",
                content: resolvedAnswer,
                rawContent: rawAnswerForDisplay,
                rawText: rawAnswerForDisplay,
                customerCopy: streamResult.customerCopy ?? streamResult.customer_answer ?? null,
                customer_answer: streamResult.customer_answer ?? null,
                finalized_answer: streamResult.finalized_answer ?? null,
                provider_status: streamResult.provider_status ?? null,
                sources: streamResult.sources,
                confidence: streamResult.confidence,
                metadata: {
                  ...currentMetadata,
                  finalizedAnswer: streamResult.finalized_answer ?? currentMetadata.finalizedAnswer,
                  customerCopy: streamResult.customerCopy ?? streamResult.customer_answer ?? currentMetadata.customerCopy,
                  rawAnswerBeforeFinalizer: streamResult.rawAnswerBeforeFinalizer ?? currentMetadata.rawAnswerBeforeFinalizer ?? null,
                  rawCustomerAnswerBeforeFinalizer: streamResult.rawCustomerAnswerBeforeFinalizer ?? currentMetadata.rawCustomerAnswerBeforeFinalizer ?? null,
                  rawContent: rawAnswerForDisplay ?? currentMetadata.rawContent ?? null,
                  rawText: rawAnswerForDisplay ?? currentMetadata.rawText ?? null,
                  rawAnswer: streamResult.rawAnswer ?? currentMetadata.rawAnswer ?? rawAnswerForDisplay,
                  nextStep: streamResult.nextStep ?? currentMetadata.nextStep,
                  traceId: streamResult.traceId ?? currentMetadata.traceId,
                  runtimeOutput: streamResult.runtime_output ?? currentMetadata.runtimeOutput,
                  runtimeSources: streamResult.runtime_sources ?? currentMetadata.runtimeSources,
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
          });

          applyConversationRunAction({
            type: "run/complete",
            requestId,
            conversationId: streamResult.conversation_id,
            mode: normalizedMode,
            finalMessageId: streamResult.message_id,
            messages: completedMessages,
            updatedAt: Date.now()
          });

          if (activeConversationIdRef.current === sourceViewId) {
            void handleSelectConversation(streamResult.conversation_id);
          }
        }
      });

      void loadConversations({ background: true, force: true });
      return true;
    } catch (requestError) {
      const currentRun = conversationRunStateRef.current.byRequestId[requestId];
      const runViewId = currentRun?.viewId ?? sourceViewId;

      if (currentRun?.phase === "completed") {
        return true;
      }

      if (requestError instanceof DOMException && requestError.name === "AbortError") {
        const cancelledMessages = (currentRun?.messages ?? optimisticMessages).map((message) => {
          if (message.id === optimisticUserMessage.id) {
            return {
              ...message,
              pending: false
            };
          }

          if (message.id === optimisticAssistantMessage.id) {
            return {
              ...message,
              content: message.content || "已停止生成。",
              pending: false
            };
          }

          return message;
        });

        applyConversationRunAction({
          type: "run/cancel",
          requestId,
          messages: cancelledMessages,
          error: null,
          updatedAt: Date.now()
        });

        if (activeConversationIdRef.current === runViewId) {
          pendingScrollToUserMessageIdRef.current = null;
          setScrollFocusMessageId(null);
          showNotice("已停止生成。");
        }

        return false;
      }

      const requestErrorMessage = requestError instanceof Error
        ? requestError.message
        : "发送失败，请稍后重试。";
      const failedMessages = (currentRun?.messages ?? optimisticMessages).map((message) => {
        if (message.id === optimisticUserMessage.id) {
          return {
            ...message,
            pending: false
          };
        }

        if (message.id === optimisticAssistantMessage.id) {
          return {
            ...message,
            content: message.content || requestErrorMessage,
            pending: false,
            provider_status: "error" as const
          };
        }

        return message;
      });

      applyConversationRunAction({
        type: "run/fail",
        requestId,
        messages: failedMessages,
        error: requestErrorMessage,
        updatedAt: Date.now()
      });

      if (activeConversationIdRef.current === runViewId) {
        pendingScrollToUserMessageIdRef.current = null;
        setScrollFocusMessageId(null);
        setInput(text);
        setManualChatMode(submittedManualChatMode);
        setError(requestErrorMessage);
      }

      return false;
    } finally {
      if (askControllerByRequestIdRef.current.get(requestId) === abortController) {
        askControllerByRequestIdRef.current.delete(requestId);
      }
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

    const result = await safeCopyTextDetailed(linkDialog.link, { selectTarget: selectionElement });

    if (result.copied) {
      setLinkDialog((current) => current ? { ...current, copied: true } : current);
      setActionSuccess(linkDialog.copySuccessMessage, "copy");
      return;
    }

    if (result.selected) {
      const manualMessage = result.message.includes("长按")
        ? "已选中链接，请长按复制。"
        : "已选中链接，请按 Ctrl+C 复制。";

      setLinkDialog((current) => current ? { ...current, copied: false } : current);
      setLinkCopyFailureSignal((value) => value + 1);
      setActionInfo(manualMessage, "copy");
      return;
    }

    setLinkDialog((current) => current ? { ...current, copied: false } : current);
    setLinkCopyFailureSignal((value) => value + 1);
    setActionError("请手动复制选中的链接", "copy");
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
          loadError={conversationLoadError}
          currentUser={currentUser}
          userName={currentUserName}
          userDescription={currentUserAccount}
          avatarUrl={currentAvatarUrl}
          desktopLayout
          onClose={closeSidebarManually}
          onNewChat={handleNewChat}
          onSelect={handleSelectConversation}
          onRetryLoad={() => loadConversations({ force: true })}
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
            ) : historyLoadError ? (
              <div className="flex min-h-[360px] flex-1 items-center justify-center px-8 text-center text-sm font-semibold text-slate-500">
                {historyLoadError}
              </div>
            ) : conversationId && visibleMessages.length === 0 ? (
              <div className="flex min-h-[360px] flex-1 items-center justify-center px-8 text-center text-sm font-semibold text-slate-500">
                该会话暂无消息
              </div>
            ) : (
              <ChatMessages
                messages={visibleMessages}
                loading={loading}
                mode={mode}
                onModeChange={setMode}
                onEditUserMessage={handleEditUserMessage}
                currentUser={currentUser}
                userName={currentUserName}
                userAvatarUrl={currentAvatarUrl}
                focusMessageId={scrollFocusMessageId}
              />
            )}
          </div>

          <PromptHistoryRail prompts={promptHistory} onSelect={handlePromptHistorySelect} />

          {showScrollToBottom ? (
            <button
              type="button"
              onClick={() => scrollChatToBottom()}
              className="focus-ring absolute bottom-[7.25rem] left-1/2 z-30 inline-flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-lg shadow-slate-300/40 transition hover:-translate-y-0.5 hover:border-slate-300 hover:text-slate-950"
              aria-label="滚动到底部"
              title="滚动到底部"
            >
              <ArrowDown className="h-5 w-5" aria-hidden="true" />
            </button>
          ) : null}

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
