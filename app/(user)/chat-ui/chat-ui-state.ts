"use client";

import type {
  AskChatRequest,
  AskChatResponse,
  ChatAttachmentDraft,
  ChatMessageView,
  ChatMode,
  CurrentChatUser
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
    cleanText(user?.nickname) ||
    cleanText(user?.name) ||
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

export function getCurrentChatUserAvatarUrl(user: CurrentChatUser | null | undefined) {
  return (
    cleanText(user?.avatar_url) ||
    cleanText(user?.avatarUrl) ||
    cleanText(user?.avatar) ||
    cleanText(user?.profile_image) ||
    cleanText(user?.profileImage) ||
    cleanText(user?.image) ||
    null
  );
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

  return {
    question: text,
    text,
    attachments: input.attachments.map(createAskAttachmentPayload),
    conversation_id: input.conversation_id,
    mode: normalizeChatMode(input.mode),
    enable_deep_thinking: input.enable_deep_thinking,
    enable_web_search: input.enable_web_search,
    ...(input.business_execution ? { business_execution: input.business_execution } : {}),
    ...(businessExecutionPrompt ? { business_execution_prompt: businessExecutionPrompt } : {}),
    ...(autoSalesAgent ? { auto_sales_agent: autoSalesAgent } : {}),
    ...(conversionFeedback ? { conversion_feedback: conversionFeedback } : {})
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
      customer_answer: result.customer_answer ?? null,
      provider_status: result.provider_status ?? null,
      sources: result.sources,
      confidence: result.confidence,
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
