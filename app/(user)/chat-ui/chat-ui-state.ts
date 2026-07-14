"use client";

import type {
  AskChatRequest,
  AskChatResponse,
  ChatAttachmentDraft,
  ChatMessageView,
  ChatMode,
  CurrentChatUser,
  SelectedKnowledgeBase
} from "./types";
import type { ConversionFeedbackEvent } from "@/lib/agent/conversion-feedback-loop";
import {
  GLOBAL_LEARNING_BEHAVIOR_STORAGE_KEY,
  type SessionOutcome,
  type UserBehaviorSignal
} from "@/lib/agent/global-learning-engine";

export interface ChatUiResetState {
  conversationId: string | null;
  messages: ChatMessageView[];
  input: string;
  error: string | null;
}

export const CHAT_DRAFT_CONVERSATION_PREFIX = "draft:";

export type ChatConversationRunPhase =
  | "uploading"
  | "generating"
  | "completed"
  | "failed"
  | "cancelled";

export interface ChatConversationRun {
  requestId: string;
  viewId: string;
  serverConversationId: string | null;
  phase: ChatConversationRunPhase;
  mode: ChatMode;
  messages: ChatMessageView[];
  localUserMessageId: string;
  localAssistantMessageId: string;
  finalMessageId: string | null;
  title: string;
  error: string | null;
  startedAt: number;
  updatedAt: number;
}

export interface ChatConversationRunState {
  byRequestId: Record<string, ChatConversationRun>;
  latestRequestByViewId: Record<string, string>;
}

export type ChatConversationRunAction =
  | {
      type: "run/start";
      run: ChatConversationRun;
    }
  | {
      type: "run/update-messages";
      requestId: string;
      messages: ChatMessageView[];
      updatedAt: number;
    }
  | {
      type: "run/mark-generating";
      requestId: string;
      mode: ChatMode;
      updatedAt: number;
    }
  | {
      type: "run/complete";
      requestId: string;
      conversationId: string;
      mode: ChatMode;
      finalMessageId: string;
      messages: ChatMessageView[];
      updatedAt: number;
    }
  | {
      type: "run/fail" | "run/cancel";
      requestId: string;
      messages: ChatMessageView[];
      error: string | null;
      updatedAt: number;
    }
  | {
      type: "run/drop";
      requestId: string;
    }
  | {
      type: "run/clear";
    };

export interface ChatConversationHistoryMergeResult {
  messages: ChatMessageView[];
  source: "history" | "runtime";
  dropRequestId: string | null;
}

export function createEmptyChatConversationRunState(): ChatConversationRunState {
  return {
    byRequestId: {},
    latestRequestByViewId: {}
  };
}

export function createDraftConversationId(requestId: string) {
  return `${CHAT_DRAFT_CONVERSATION_PREFIX}${requestId}`;
}

export function isDraftConversationId(value: string | null | undefined) {
  return typeof value === "string" && value.startsWith(CHAT_DRAFT_CONVERSATION_PREFIX);
}

export function isChatConversationRunBusy(run: ChatConversationRun | null | undefined) {
  return run?.phase === "uploading" || run?.phase === "generating";
}

export function getLatestChatConversationRun(
  state: ChatConversationRunState,
  viewId: string | null | undefined
) {
  if (!viewId) {
    return null;
  }

  const requestId = state.latestRequestByViewId[viewId];

  return requestId ? state.byRequestId[requestId] ?? null : null;
}

export function getLatestChatConversationRuns(state: ChatConversationRunState) {
  const seen = new Set<string>();
  const runs: ChatConversationRun[] = [];

  for (const requestId of Object.values(state.latestRequestByViewId)) {
    if (seen.has(requestId)) {
      continue;
    }

    const run = state.byRequestId[requestId];

    if (run) {
      seen.add(requestId);
      runs.push(run);
    }
  }

  return runs;
}

function removeChatConversationRun(
  state: ChatConversationRunState,
  requestId: string
): ChatConversationRunState {
  const run = state.byRequestId[requestId];

  if (!run) {
    return state;
  }

  const byRequestId = { ...state.byRequestId };
  const latestRequestByViewId = { ...state.latestRequestByViewId };

  delete byRequestId[requestId];

  if (latestRequestByViewId[run.viewId] === requestId) {
    delete latestRequestByViewId[run.viewId];
  }

  return {
    byRequestId,
    latestRequestByViewId
  };
}

function canUpdateChatConversationRun(state: ChatConversationRunState, run: ChatConversationRun) {
  return isChatConversationRunBusy(run) && state.latestRequestByViewId[run.viewId] === run.requestId;
}

export function chatConversationRunReducer(
  state: ChatConversationRunState,
  action: ChatConversationRunAction
): ChatConversationRunState {
  if (action.type === "run/clear") {
    return createEmptyChatConversationRunState();
  }

  if (action.type === "run/drop") {
    return removeChatConversationRun(state, action.requestId);
  }

  if (action.type === "run/start") {
    const previousRequestId = state.latestRequestByViewId[action.run.viewId];
    const baseState = previousRequestId
      ? removeChatConversationRun(state, previousRequestId)
      : state;

    return {
      byRequestId: {
        ...baseState.byRequestId,
        [action.run.requestId]: action.run
      },
      latestRequestByViewId: {
        ...baseState.latestRequestByViewId,
        [action.run.viewId]: action.run.requestId
      }
    };
  }

  const run = state.byRequestId[action.requestId];

  if (!run || !canUpdateChatConversationRun(state, run)) {
    return state;
  }

  if (action.type === "run/update-messages") {
    return {
      ...state,
      byRequestId: {
        ...state.byRequestId,
        [run.requestId]: {
          ...run,
          messages: action.messages,
          updatedAt: action.updatedAt
        }
      }
    };
  }

  if (action.type === "run/mark-generating") {
    return {
      ...state,
      byRequestId: {
        ...state.byRequestId,
        [run.requestId]: {
          ...run,
          phase: "generating",
          mode: action.mode,
          updatedAt: action.updatedAt
        }
      }
    };
  }

  if (action.type === "run/complete") {
    const latestRequestByViewId = { ...state.latestRequestByViewId };

    if (latestRequestByViewId[run.viewId] === run.requestId) {
      delete latestRequestByViewId[run.viewId];
    }
    latestRequestByViewId[action.conversationId] = run.requestId;

    return {
      byRequestId: {
        ...state.byRequestId,
        [run.requestId]: {
          ...run,
          viewId: action.conversationId,
          serverConversationId: action.conversationId,
          phase: "completed",
          mode: action.mode,
          messages: action.messages,
          finalMessageId: action.finalMessageId,
          error: null,
          updatedAt: action.updatedAt
        }
      },
      latestRequestByViewId
    };
  }

  const phase = action.type === "run/cancel" ? "cancelled" : "failed";

  return {
    ...state,
    byRequestId: {
      ...state.byRequestId,
      [run.requestId]: {
        ...run,
        phase,
        messages: action.messages,
        error: action.error,
        updatedAt: action.updatedAt
      }
    }
  };
}

export function updateChatConversationRunMessages(
  state: ChatConversationRunState,
  requestId: string,
  updater: (messages: ChatMessageView[]) => ChatMessageView[],
  updatedAt = Date.now()
) {
  const run = state.byRequestId[requestId];

  if (!run || !canUpdateChatConversationRun(state, run)) {
    return state;
  }

  return chatConversationRunReducer(state, {
    type: "run/update-messages",
    requestId,
    messages: updater(run.messages),
    updatedAt
  });
}

export function mergeConversationHistoryWithRun(input: {
  historyMessages: ChatMessageView[];
  run: ChatConversationRun | null;
}): ChatConversationHistoryMergeResult {
  const { historyMessages, run } = input;

  if (!run) {
    return {
      messages: historyMessages,
      source: "history",
      dropRequestId: null
    };
  }

  if (
    run.phase === "completed" &&
    run.finalMessageId &&
    historyMessages.some((message) => message.id === run.finalMessageId)
  ) {
    return {
      messages: historyMessages,
      source: "history",
      dropRequestId: run.requestId
    };
  }

  return {
    messages: run.messages,
    source: "runtime",
    dropRequestId: null
  };
}

export function normalizeChatMode(value: unknown): ChatMode {
  return value === "expert" ? "expert" : "fast";
}

export function createNewChatState(): ChatUiResetState {
  return {
    conversationId: null,
    messages: [],
    input: "",
    error: null
  };
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanScopeText(...values: unknown[]) {
  for (const value of values) {
    const text = cleanText(value).slice(0, 120);

    if (text) {
      return text;
    }
  }

  return "";
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function getAutoSalesAgentPayload(value: unknown) {
  const businessExecution = getRecord(value);
  const autoSalesAgent = getRecord(businessExecution?.autoSalesAgent);
  const version = cleanText(autoSalesAgent?.version);

  return version === "ai-knowledge-os-v8" || version === "ai-knowledge-os-v8.1" || version === "ai-knowledge-os-v9"
    ? autoSalesAgent
    : null;
}

const CONVERSION_FEEDBACK_STORAGE_KEY = "chat-ui:conversion-feedback:last";
const GLOBAL_BEHAVIOR_SIGNAL_LIMIT = 12;

function getConversionFeedbackStoragePayload() {
  try {
    const stored = getSessionStorage()?.getItem(CONVERSION_FEEDBACK_STORAGE_KEY);

    return stored ? getRecord(JSON.parse(stored)) : null;
  } catch {
    return null;
  }
}

function classifySessionOutcome(payload: {
  action_clicked: string;
  conversion_signal: number;
  follow_up_question: boolean;
  time_on_page: number;
}): SessionOutcome {
  if (payload.conversion_signal >= 0.78 && ["close_deal", "handoff_service"].includes(payload.action_clicked)) {
    return "converted";
  }

  if (payload.conversion_signal >= 0.65 || payload.follow_up_question) {
    return "advanced";
  }

  if (payload.action_clicked || payload.time_on_page >= 8) {
    return "engaged";
  }

  if (payload.conversion_signal <= 0.18) {
    return "lost";
  }

  if (payload.time_on_page <= 2 && !payload.action_clicked) {
    return "stalled";
  }

  return "unknown";
}

function getStoredGlobalBehaviorSignals(): UserBehaviorSignal[] {
  try {
    const rawValue = getSessionStorage()?.getItem(GLOBAL_LEARNING_BEHAVIOR_STORAGE_KEY);
    const parsed = rawValue ? JSON.parse(rawValue) : null;

    return Array.isArray(parsed) ? parsed.slice(-GLOBAL_BEHAVIOR_SIGNAL_LIMIT) as UserBehaviorSignal[] : [];
  } catch {
    return [];
  }
}

function rememberGlobalBehaviorSignal(signal: UserBehaviorSignal) {
  try {
    const signals = [...getStoredGlobalBehaviorSignals(), signal].slice(-GLOBAL_BEHAVIOR_SIGNAL_LIMIT);

    getSessionStorage()?.setItem(GLOBAL_LEARNING_BEHAVIOR_STORAGE_KEY, JSON.stringify(signals));
  } catch {
    // Global learning is a local UI signal; storage failures must not block chat.
  }
}

function getConversionFeedbackPayload(value: unknown) {
  const autoSalesAgent = getAutoSalesAgentPayload(value);
  const conversionFeedbackLoop = getRecord(autoSalesAgent?.conversionFeedbackLoop);
  const existingFeedback = getRecord(conversionFeedbackLoop?.feedback);
  const storedFeedback = getConversionFeedbackStoragePayload();

  return {
    ...existingFeedback,
    ...(storedFeedback ?? {}),
    intent: cleanText(storedFeedback?.intent) || cleanText(existingFeedback?.intent) || cleanText(autoSalesAgent?.sourceIntent) || "knowledge_user",
    conversion_signal: Number(storedFeedback?.conversion_signal ?? existingFeedback?.conversion_signal ?? autoSalesAgent?.dealProbability ?? 0.45),
    global_behavior: getStoredGlobalBehaviorSignals()
  };
}

function normalizeAskSelectedKnowledgeBases(value: unknown): SelectedKnowledgeBase[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const items: SelectedKnowledgeBase[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const record = item as Record<string, unknown>;
    const kbId = cleanScopeText(record.kb_id, record.kbId, record.knowledgeBaseId);
    const expertId = cleanScopeText(record.expert_id, record.expertId, record.agentId);
    const tenantId = cleanScopeText(record.tenant_id, record.tenantId);
    const namespace = cleanScopeText(record.namespace, record.tenant_id, record.tenantId);
    const title = cleanScopeText(record.title, record.name);

    if (!kbId || !title || seen.has(kbId)) {
      continue;
    }

    seen.add(kbId);
    items.push({
      kb_id: kbId,
      kbId,
      knowledgeBaseId: kbId,
      expert_id: expertId || undefined,
      expertId: expertId || undefined,
      agentId: expertId || undefined,
      tenant_id: tenantId || undefined,
      tenantId: tenantId || undefined,
      namespace: namespace || "default",
      title,
      name: title,
      expertName: cleanText(record.expertName).slice(0, 120) || undefined,
      category: cleanText(record.category).slice(0, 80) || undefined,
      description: cleanText(record.description).slice(0, 240) || undefined,
      active: record.active === true
    });

    if (items.length >= 8) {
      break;
    }
  }

  if (items.length === 0) {
    return [];
  }

  const activeIndex = items.findIndex((item) => item.active);

  return items.map((item, index) => ({
    ...item,
    active: activeIndex >= 0 ? index === activeIndex : index === 0
  }));
}

function normalizeAskActiveKnowledgeBase(
  selectedKnowledgeBases: SelectedKnowledgeBase[],
  activeKnowledgeBase: AskChatRequest["activeKnowledgeBase"]
) {
  const selectedActive = selectedKnowledgeBases.find((item) => item.active) ?? selectedKnowledgeBases[0] ?? null;

  if (!activeKnowledgeBase) {
    return selectedActive;
  }

  const kbId = cleanScopeText(activeKnowledgeBase.kb_id, activeKnowledgeBase.kbId, activeKnowledgeBase.knowledgeBaseId);
  const expertId = cleanScopeText(activeKnowledgeBase.expert_id, activeKnowledgeBase.expertId, activeKnowledgeBase.agentId);
  const tenantId = cleanScopeText(activeKnowledgeBase.tenant_id, activeKnowledgeBase.tenantId);
  const namespace = cleanScopeText(activeKnowledgeBase.namespace, activeKnowledgeBase.tenant_id, activeKnowledgeBase.tenantId);
  const title = cleanScopeText(activeKnowledgeBase.title, activeKnowledgeBase.name);

  if (!kbId || !title) {
    return selectedActive;
  }

  return {
    kb_id: kbId,
    kbId,
    knowledgeBaseId: kbId,
    expert_id: expertId || undefined,
    expertId: expertId || undefined,
    agentId: expertId || undefined,
    tenant_id: tenantId || undefined,
    tenantId: tenantId || undefined,
    namespace: namespace || "default",
    title,
    name: title,
    expertName: cleanText(activeKnowledgeBase.expertName).slice(0, 120) || undefined,
    category: cleanText(activeKnowledgeBase.category).slice(0, 80) || undefined,
    description: cleanText(activeKnowledgeBase.description).slice(0, 240) || undefined,
    active: true
  };
}

export function rememberConversionFeedbackEvent(event: Partial<ConversionFeedbackEvent>) {
  if (typeof window === "undefined") {
    return;
  }

  const payload = {
    intent: cleanText(event.intent) || "knowledge_user",
    action_clicked: cleanText(event.action_clicked),
    time_on_page: Math.max(0, Math.round(typeof event.time_on_page === "number" ? event.time_on_page : performance.now() / 1000)),
    follow_up_question: event.follow_up_question === true,
    conversion_signal: Math.max(0, Math.min(1, typeof event.conversion_signal === "number" ? event.conversion_signal : 0.45))
  };
  const sessionOutcome = classifySessionOutcome(payload);

  try {
    getSessionStorage()?.setItem(CONVERSION_FEEDBACK_STORAGE_KEY, JSON.stringify(payload));
    rememberGlobalBehaviorSignal({
      intent: payload.intent as UserBehaviorSignal["intent"],
      action_clicked: payload.action_clicked ? payload.action_clicked as UserBehaviorSignal["action_clicked"] : null,
      conversion_signal: payload.conversion_signal,
      session_outcome: sessionOutcome,
      time_to_action: payload.time_on_page,
      time_on_page: payload.time_on_page,
      follow_up_question: payload.follow_up_question,
      source: "client_session_history"
    });
  } catch {
    // Feedback is optional; failing to store it must not block chat.
  }
}

function cleanMetadataUrl(value: unknown) {
  const text = cleanText(value);

  if (!text || text.startsWith("data:") || text.startsWith("blob:")) {
    return "";
  }

  return text;
}

function getAttachmentUrlMetadata(attachment: ChatAttachmentDraft) {
  return {
    ...(cleanMetadataUrl(attachment.previewUrl) ? { previewUrl: cleanMetadataUrl(attachment.previewUrl) } : {}),
    ...(cleanMetadataUrl(attachment.url) ? { url: cleanMetadataUrl(attachment.url) } : {}),
    ...(cleanMetadataUrl(attachment.publicUrl) ? { publicUrl: cleanMetadataUrl(attachment.publicUrl) } : {}),
    ...(cleanMetadataUrl(attachment.fileUrl) ? { fileUrl: cleanMetadataUrl(attachment.fileUrl) } : {}),
    ...(cleanMetadataUrl(attachment.downloadUrl) ? { downloadUrl: cleanMetadataUrl(attachment.downloadUrl) } : {}),
    ...(cleanMetadataUrl(attachment.src) ? { src: cleanMetadataUrl(attachment.src) } : {}),
    ...(cleanMetadataUrl(attachment.path) ? { path: cleanMetadataUrl(attachment.path) } : {}),
    ...(cleanMetadataUrl(attachment.storagePath) ? { storagePath: cleanMetadataUrl(attachment.storagePath) } : {})
  };
}

const ATTACHMENT_PREVIEW_CACHE_PREFIX = "chat-ui:attachment-preview:";
const attachmentPreviewCache = new Map<string, string>();

function getSessionStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage;
}

function getAttachmentIdentityValues(attachment: ChatAttachmentDraft) {
  const metadata = attachment.metadata ?? {};

  return [
    attachment.reference_id,
    attachment.id,
    attachment.name,
    attachment.filename,
    metadata.local_id,
    metadata.reference_id,
    metadata.referenceId
  ]
    .map(cleanText)
    .filter(Boolean);
}

function getAttachmentPreviewCacheKey(value: string) {
  return `${ATTACHMENT_PREVIEW_CACHE_PREFIX}${value}`;
}

function getAttachmentPreviewUrlForCache(attachment: ChatAttachmentDraft) {
  return (
    cleanText(attachment.previewUrl) ||
    cleanText(attachment.url) ||
    cleanText(attachment.src) ||
    cleanText(attachment.dataUrl) ||
    cleanText(attachment.fileUrl) ||
    cleanText(attachment.publicUrl) ||
    cleanText(attachment.downloadUrl) ||
    cleanText(attachment.path) ||
    cleanText(attachment.storagePath)
  );
}

export function rememberChatAttachmentPreviewUrl(attachment: ChatAttachmentDraft) {
  const previewUrl = getAttachmentPreviewUrlForCache(attachment);

  if (!previewUrl) {
    return;
  }

  for (const value of getAttachmentIdentityValues(attachment)) {
    attachmentPreviewCache.set(value, previewUrl);

    try {
      getSessionStorage()?.setItem(getAttachmentPreviewCacheKey(value), previewUrl);
    } catch {
      // Session storage is optional; the in-memory cache still covers the active page.
    }
  }
}

export function getCachedChatAttachmentPreviewUrl(attachment: ChatAttachmentDraft) {
  for (const value of getAttachmentIdentityValues(attachment)) {
    const cached = attachmentPreviewCache.get(value);

    if (cached) {
      return cached;
    }

    try {
      const stored = getSessionStorage()?.getItem(getAttachmentPreviewCacheKey(value));

      if (stored) {
        attachmentPreviewCache.set(value, stored);
        return stored;
      }
    } catch {
      // Ignore storage access failures in SSR, private mode, and restricted WebViews.
    }
  }

  return "";
}

export function getCurrentChatUserDisplayName(user: CurrentChatUser | null | undefined) {
  const displayName =
    cleanText(user?.displayName) ||
    cleanText(user?.nickname) ||
    cleanText(user?.name) ||
    cleanText(user?.username) ||
    cleanText(user?.phone) ||
    cleanText(user?.email) ||
    cleanText(user?.account);

  return displayName || "当前用户";
}

export function getCurrentChatUserAccount(user: CurrentChatUser | null | undefined) {
  return cleanText(user?.phone) || cleanText(user?.email) || cleanText(user?.account);
}

export function formatChatUserAccountForDisplay(account: string) {
  const value = cleanText(account);
  const chinaPhoneMatch = value.match(/^\+86(1[3-9]\d{9})$/);

  return chinaPhoneMatch ? chinaPhoneMatch[1] : value;
}

export function getCurrentChatUserDisplayAccount(user: CurrentChatUser | null | undefined) {
  return formatChatUserAccountForDisplay(getCurrentChatUserAccount(user));
}

export function getCurrentChatUserInitial(user: CurrentChatUser | null | undefined) {
  return getCurrentChatUserDisplayName(user).slice(0, 1) || "用";
}

export function getChatUserAvatarStorageKey(user: CurrentChatUser | null | undefined) {
  const identity = cleanText(user?.id) || getCurrentChatUserAccount(user) || "anonymous";

  return `chat-ui:user-avatar:${identity}`;
}

const loopbackAvatarHostPattern = /^(?:localhost|0\.0\.0\.0|127(?:\.\d{1,3}){3}|\[?::1\]?)$/i;

export function normalizeCurrentChatUserAvatarUrl(url: string | null | undefined) {
  const value = cleanText(url);

  if (!value) {
    return null;
  }

  if (!/^https?:\/\//i.test(value)) {
    return value;
  }

  try {
    const parsedUrl = new URL(value);

    if (loopbackAvatarHostPattern.test(parsedUrl.hostname)) {
      return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
    }
  } catch {
    return value;
  }

  return value;
}

function withAvatarCacheVersion(url: string | null, version: string | null) {
  if (!url || !version || url.startsWith("data:") || url.startsWith("blob:")) {
    return url;
  }

  let value = url;

  if (url.startsWith("/") && typeof window !== "undefined") {
    value = new URL(url, window.location.origin).toString();
  }

  const separator = value.includes("?") ? "&" : "?";

  return `${value}${separator}avatar_v=${encodeURIComponent(version)}`;
}

export function getCurrentChatUserAvatarUrl(user: CurrentChatUser | null | undefined) {
  const avatarUrl = (
    cleanText(user?.avatar_url) ||
    cleanText(user?.avatarUrl) ||
    cleanText(user?.avatar) ||
    cleanText(user?.profile_image) ||
    cleanText(user?.profileImage) ||
    cleanText(user?.image) ||
    null
  );
  const avatarVersion = cleanText(user?.avatar_updated_at) || cleanText(user?.avatarUpdatedAt) || null;

  return withAvatarCacheVersion(normalizeCurrentChatUserAvatarUrl(avatarUrl), avatarVersion);
}

export function createAskAttachmentPayload(attachment: ChatAttachmentDraft) {
  const metadata = {
    ...(attachment.metadata ?? {}),
    ...getAttachmentUrlMetadata(attachment),
    ...(attachment.id ? { local_id: attachment.id } : {}),
    ...(attachment.source ? { source: attachment.source } : {})
  };
  const mimeType = attachment.mime_type || attachment.mimeType;

  return {
    type: attachment.type,
    name: attachment.name,
    filename: attachment.filename || attachment.name,
    mime_type: mimeType,
    mimeType,
    size: attachment.size,
    reference_id: attachment.reference_id || attachment.id,
    ...(cleanMetadataUrl(attachment.url) ? { url: cleanMetadataUrl(attachment.url) } : {}),
    ...(cleanMetadataUrl(attachment.publicUrl) ? { publicUrl: cleanMetadataUrl(attachment.publicUrl) } : {}),
    ...(cleanMetadataUrl(attachment.fileUrl) ? { fileUrl: cleanMetadataUrl(attachment.fileUrl) } : {}),
    ...(cleanMetadataUrl(attachment.downloadUrl) ? { downloadUrl: cleanMetadataUrl(attachment.downloadUrl) } : {}),
    ...(cleanMetadataUrl(attachment.src) ? { src: cleanMetadataUrl(attachment.src) } : {}),
    ...(cleanText(attachment.storage) ? { storage: cleanText(attachment.storage) } : {}),
    ...(cleanText(attachment.blobKey) ? { blobKey: cleanText(attachment.blobKey) } : {}),
    metadata
  };
}

export function createAskRequestPayload(input: AskChatRequest) {
  const text = input.text.trim();
  const businessExecutionPrompt = cleanText(input.business_execution_prompt);
  const autoSalesAgent = getAutoSalesAgentPayload(input.business_execution);
  const conversionFeedback = input.conversion_feedback ?? getConversionFeedbackPayload(input.business_execution);
  const selectedKnowledgeBases = normalizeAskSelectedKnowledgeBases(input.selectedKnowledgeBases);
  const activeKnowledgeBase = normalizeAskActiveKnowledgeBase(selectedKnowledgeBases, input.activeKnowledgeBase);
  const knowledgeBaseId = cleanScopeText(activeKnowledgeBase?.knowledgeBaseId, activeKnowledgeBase?.kbId, activeKnowledgeBase?.kb_id, input.knowledgeBaseId, input.kb_id);
  const agentId = cleanScopeText(activeKnowledgeBase?.agentId, activeKnowledgeBase?.expertId, activeKnowledgeBase?.expert_id, input.agentId, input.expert_id);
  const tenantId = cleanScopeText(activeKnowledgeBase?.tenantId, activeKnowledgeBase?.tenant_id, input.tenant_id);
  const namespace = cleanScopeText(activeKnowledgeBase?.namespace, input.namespace, tenantId);

  return {
    question: text,
    text,
    attachments: input.attachments.map(createAskAttachmentPayload),
    conversation_id: input.conversation_id,
    mode: normalizeChatMode(input.mode),
    ...(input.userMode ? { userMode: input.userMode } : {}),
    ...(input.modeSource ? { modeSource: input.modeSource } : {}),
    ...(input.modeLabel ? { modeLabel: input.modeLabel } : {}),
    ...(input.modePrompt ? { modePrompt: input.modePrompt } : {}),
    ...(typeof input.modeConfidence === "number" ? { modeConfidence: input.modeConfidence } : {}),
    ...(input.modeReason ? { modeReason: input.modeReason } : {}),
    ...(input.modeAlternatives ? { modeAlternatives: input.modeAlternatives } : {}),
    ...(input.classifierVersion ? { classifierVersion: input.classifierVersion } : {}),
    enable_deep_thinking: input.enable_deep_thinking,
    enable_web_search: input.enable_web_search,
    ...(input.business_execution ? { business_execution: input.business_execution } : {}),
    ...(businessExecutionPrompt ? { business_execution_prompt: businessExecutionPrompt } : {}),
    ...(autoSalesAgent ? { auto_sales_agent: autoSalesAgent } : {}),
    ...(conversionFeedback ? { conversion_feedback: conversionFeedback } : {}),
    selectedKnowledgeBases,
    activeKnowledgeBase,
    kb_id: knowledgeBaseId || null,
    kbId: knowledgeBaseId || null,
    knowledgeBaseId: knowledgeBaseId || null,
    expert_id: agentId || null,
    expertId: agentId || null,
    agentId: agentId || null,
    tenant_id: tenantId || null,
    tenantId: tenantId || null,
    namespace: namespace || null
  };
}

export function createUserMessage(text: string, attachments: AskChatRequest["attachments"] = []): ChatMessageView {
  return {
    id: `local-user-${Date.now()}`,
    role: "user",
    content: text.trim(),
    attachments,
    created_at: new Date().toISOString(),
    pending: true
  };
}

export function appendAskResult(
  previousMessages: ChatMessageView[],
  localUserMessageId: string,
  result: AskChatResponse
): ChatMessageView[] {
  const confirmedMessages = previousMessages.map((message) => (
    message.id === localUserMessageId
      ? { ...message, pending: false }
      : message
  ));

  return [
    ...confirmedMessages,
    {
      id: result.message_id,
      role: "assistant",
      content: result.answer,
      rawContent: result.rawAnswerBeforeFinalizer ?? result.rawContent ?? result.rawText ?? result.rawAnswer ?? null,
      rawText: result.rawAnswerBeforeFinalizer ?? result.rawText ?? result.rawAnswer ?? null,
      customerCopy: result.customerCopy ?? result.customer_answer ?? null,
      customer_answer: result.customer_answer ?? null,
      finalized_answer: result.finalized_answer ?? null,
      provider_status: result.provider_status ?? null,
      sources: result.sources,
      confidence: result.confidence,
      metadata: {
        customerCopy: result.customerCopy ?? result.customer_answer ?? null,
        nextStep: result.nextStep ?? null,
        traceId: result.traceId ?? null,
        rawAnswerBeforeFinalizer: result.rawAnswerBeforeFinalizer ?? null,
        rawCustomerAnswerBeforeFinalizer: result.rawCustomerAnswerBeforeFinalizer ?? null,
        rawContent: result.rawAnswerBeforeFinalizer ?? result.rawContent ?? result.rawText ?? result.rawAnswer ?? null,
        rawText: result.rawAnswerBeforeFinalizer ?? result.rawText ?? result.rawAnswer ?? null,
        runtimeOutput: result.runtime_output ?? null,
        runtimeSources: result.runtime_sources ?? null
      },
      created_at: new Date().toISOString()
    }
  ];
}

export function formatConversationTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
