import { createAskRequestPayload } from "./chat-ui-state";
import {
  createFeedbackRecord,
  type KnowledgeFeedbackEventType,
  type KnowledgeFeedbackInput
} from "@/lib/enterprise/feedback/feedback-collector";
import type {
  AvatarUpdateResponse,
  AskChatRequest,
  AskChatResponse,
  ChatAttachmentDraft,
  ChatAttachmentUploadResponse,
  ChangePasswordInput,
  ChangePasswordResponse,
  ConversationsResponse,
  CurrentUserResponse,
  HistoryResponse,
  ChatQuickActionItem
} from "./types";

export const USER_CHAT_LOGIN_URL = "/login?app=user&next=/app";

type ApiEnvelope<T> = {
  ok?: boolean;
  success?: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
  } | string;
  code?: string;
  message?: string;
};

export type AskChatStreamEvent =
  | {
      type: "thinking";
      content: string;
    }
  | {
      type: "rag_search";
      query: string;
    }
  | {
      type: "rag_chunk";
      content: string;
      chunk_rank?: number | null;
      chunk_id?: string | null;
    }
  | {
      type: "rag_score";
      score: number;
      chunk_rank?: number | null;
    }
  | {
      type: "rag_source";
      source: string;
      title?: string | null;
      file_id?: string | null;
      chunk_id?: string | null;
    }
  | {
      type: "rag_done";
      hitCount?: number | null;
      topK?: number | null;
      relevance_score?: number | null;
    }
  | {
      type: "model_select";
      model: string;
    }
  | {
      type: "model_reason";
      reason: string;
    }
  | {
      type: "model_fallback";
      chain: string[];
    }
  | {
      type: "model_metrics";
      cost_score?: number | null;
      latency_score?: number | null;
      success_rate?: number | null;
      latency_ms?: number | null;
    }
  | {
      type: "token";
      content: string;
    }
  | {
      type: "final";
      content: string;
      data?: AskChatResponse;
    }
  | {
      type: "error";
      content: string;
      code?: string;
    };

export interface AskChatStreamHandlers {
  signal?: AbortSignal;
  onThinking?: (content: string) => void;
  onRagSearch?: (query: string) => void;
  onRagChunk?: (event: Extract<AskChatStreamEvent, { type: "rag_chunk" }>) => void;
  onRagScore?: (event: Extract<AskChatStreamEvent, { type: "rag_score" }>) => void;
  onRagSource?: (event: Extract<AskChatStreamEvent, { type: "rag_source" }>) => void;
  onRagDone?: (event: Extract<AskChatStreamEvent, { type: "rag_done" }>) => void;
  onModelSelect?: (model: string) => void;
  onModelReason?: (reason: string) => void;
  onModelFallback?: (chain: string[]) => void;
  onModelMetrics?: (event: Extract<AskChatStreamEvent, { type: "model_metrics" }>) => void;
  onToken?: (content: string) => void;
  onFinal?: (result: AskChatResponse) => void;
}

export interface ChatBehaviorFeedbackInput extends Omit<KnowledgeFeedbackInput, "eventType"> {
  eventType: KnowledgeFeedbackEventType;
}

async function readApiPayload<T>(response: Response) {
  const rawText = await response.text().catch(() => "");
  let payload: ApiEnvelope<T> | null = null;

  if (rawText) {
    try {
      payload = JSON.parse(rawText) as ApiEnvelope<T>;
    } catch {
      payload = null;
    }
  }

  return {
    payload,
    rawText
  };
}

function getApiErrorMessage<T>(payload: ApiEnvelope<T> | null, fallback: string) {
  if (payload?.error && typeof payload.error === "object" && payload.error.message) {
    return payload.error.message;
  }

  if (payload?.message) {
    return payload.message;
  }

  if (typeof payload?.error === "string") {
    return payload.error;
  }

  return fallback;
}

async function readApiResponse<T>(response: Response): Promise<T> {
  const { payload, rawText } = await readApiPayload<T>(response).catch(() => ({
    payload: null,
    rawText: ""
  }));

  if (!response.ok || !payload?.ok) {
    if (response.status === 401) {
      throw new Error("请先登录后再继续使用 AI 知识库助手。");
    }

    if (response.status === 403) {
      throw new Error("当前账号没有权限访问该功能。");
    }

    throw new Error(getApiErrorMessage(payload, rawText || "请求失败，请稍后重试。"));
  }

  if (!payload.data) {
    throw new Error("接口返回数据为空。");
  }

  return payload.data;
}

export async function askChat(input: AskChatRequest) {
  return askChatStream(input);
}

function normalizeStreamFinalEvent(event: AskChatStreamEvent): AskChatResponse | null {
  if (event.type !== "final") {
    return null;
  }

  if (event.data) {
    return event.data;
  }

  return {
    answer: event.content,
    conversation_id: "",
    message_id: `stream-final-${Date.now()}`,
    mode: "fast",
    customer_answer: null,
    sources: [],
    confidence: "low",
    provider_status: "ok"
  };
}

function parseSseEventBlock(block: string) {
  return block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
}

async function consumeAskChatEventStream(
  response: Response,
  handlers: AskChatStreamHandlers
) {
  const reader = response.body?.getReader();

  if (!reader) {
    throw new Error("当前浏览器不支持流式读取。");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: AskChatResponse | null = null;

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      const data = parseSseEventBlock(block);

      if (!data) {
        continue;
      }

      if (data === "[DONE]") {
        return finalResult;
      }

      let event: AskChatStreamEvent;

      try {
        event = JSON.parse(data) as AskChatStreamEvent;
      } catch {
        continue;
      }

      if (event.type === "thinking") {
        handlers.onThinking?.(event.content);
        continue;
      }

      if (event.type === "rag_search") {
        handlers.onRagSearch?.(event.query);
        continue;
      }

      if (event.type === "rag_chunk") {
        handlers.onRagChunk?.(event);
        continue;
      }

      if (event.type === "rag_score") {
        handlers.onRagScore?.(event);
        continue;
      }

      if (event.type === "rag_source") {
        handlers.onRagSource?.(event);
        continue;
      }

      if (event.type === "rag_done") {
        handlers.onRagDone?.(event);
        continue;
      }

      if (event.type === "model_select") {
        handlers.onModelSelect?.(event.model);
        continue;
      }

      if (event.type === "model_reason") {
        handlers.onModelReason?.(event.reason);
        continue;
      }

      if (event.type === "model_fallback") {
        handlers.onModelFallback?.(event.chain);
        continue;
      }

      if (event.type === "model_metrics") {
        handlers.onModelMetrics?.(event);
        continue;
      }

      if (event.type === "token") {
        handlers.onToken?.(event.content);
        continue;
      }

      if (event.type === "final") {
        finalResult = normalizeStreamFinalEvent(event);

        if (finalResult) {
          handlers.onFinal?.(finalResult);
        }

        continue;
      }

      if (event.type === "error") {
        throw new Error(event.content || "AI 流式响应失败。");
      }
    }
  }

  if (buffer.trim()) {
    const data = parseSseEventBlock(buffer);

    if (data && data !== "[DONE]") {
      const event = JSON.parse(data) as AskChatStreamEvent;
      const normalized = normalizeStreamFinalEvent(event);

      if (normalized) {
        finalResult = normalized;
        handlers.onFinal?.(normalized);
      }
    }
  }

  return finalResult;
}

export async function askChatStream(input: AskChatRequest, handlers: AskChatStreamHandlers = {}) {
  const response = await fetch("/api/ai/chat/ask", {
    method: "POST",
    credentials: "include",
    headers: {
      "Accept": "text/event-stream",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(createAskRequestPayload(input)),
    signal: handlers.signal
  });
  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok) {
    return readApiResponse<AskChatResponse>(response);
  }

  if (!contentType.includes("text/event-stream")) {
    const result = await readApiResponse<AskChatResponse>(response);

    handlers.onFinal?.(result);

    return result;
  }

  const result = await consumeAskChatEventStream(response, handlers);

  if (!result) {
    throw new Error("AI 流式响应未返回最终结果。");
  }

  return result;
}

export async function submitChatBehaviorFeedback(input: ChatBehaviorFeedbackInput) {
  const feedbackRecord = createFeedbackRecord(input);
  const response = await fetch("/api/feedback", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      type: feedbackRecord.converted ? "RAG_HELPFUL" : "SUGGESTION",
      content: `用户行为反馈：${feedbackRecord.eventType}`,
      metadata: {
        feedbackKind: "ai_knowledge_behavior",
        ...feedbackRecord
      }
    })
  });

  if (!response.ok) {
    return null;
  }

  return readApiResponse(response).catch(() => null);
}

export async function fetchConversations() {
  const response = await fetch("/api/ai/chat/conversations", {
    method: "GET"
  });

  return readApiResponse<ConversationsResponse>(response);
}

export async function fetchConversationHistory(conversationId: string) {
  const params = new URLSearchParams({ conversation_id: conversationId });
  const response = await fetch(`/api/ai/chat/history?${params.toString()}`, {
    method: "GET"
  });

  return readApiResponse<HistoryResponse>(response);
}

function hasPersistentAttachmentUrl(attachment: ChatAttachmentDraft) {
  const candidates = [
    attachment.url,
    attachment.publicUrl,
    attachment.fileUrl,
    attachment.downloadUrl,
    attachment.src,
    attachment.path,
    attachment.storagePath
  ];

  return candidates.some((value) => (
    typeof value === "string" &&
    value.trim() &&
    !value.trim().startsWith("blob:") &&
    !value.trim().startsWith("data:")
  ));
}

function getUploadFailureMessage<T>(response: Response, payload: ApiEnvelope<T> | null, rawText: string) {
  if (response.status === 401) {
    return "未登录，请重新登录。";
  }

  if (response.status === 403) {
    return getApiErrorMessage(payload, "当前账号没有权限上传附件。");
  }

  if (response.status === 413) {
    return "单个附件不能超过 100MB。";
  }

  return getApiErrorMessage(payload, rawText || "服务器暂不可用。");
}

async function readChatAttachmentUploadResponse(response: Response) {
  const { payload, rawText } = await readApiPayload<ChatAttachmentUploadResponse>(response).catch(() => ({
    payload: null,
    rawText: ""
  }));

  if (!response.ok || !payload?.ok) {
    throw new Error(`文件上传失败：${getUploadFailureMessage(response, payload, rawText)}`);
  }

  const topLevelPayload = payload as ApiEnvelope<ChatAttachmentUploadResponse> & {
    attachment?: ChatAttachmentDraft;
  };
  const data = payload.data ?? (topLevelPayload.attachment ? { attachment: topLevelPayload.attachment } : null);

  if (!data?.attachment) {
    throw new Error("文件上传失败：接口返回数据为空。");
  }

  return data;
}

export async function uploadChatAttachment(attachment: ChatAttachmentDraft) {
  if (hasPersistentAttachmentUrl(attachment)) {
    return attachment;
  }

  if (!attachment.file) {
    return attachment;
  }

  const formData = new FormData();

  formData.set("file", attachment.file);
  formData.set("attachment", attachment.file);
  formData.set("attachments", attachment.file);

  const response = await fetch("/api/ai/chat/attachments", {
    method: "POST",
    credentials: "include",
    body: formData
  });
  const result = await readChatAttachmentUploadResponse(response);
  const uploaded = result.attachment;

  return {
    ...attachment,
    ...uploaded,
    id: attachment.id || uploaded.id,
    reference_id: uploaded.reference_id || attachment.reference_id || attachment.id,
    previewUrl: attachment.previewUrl || uploaded.previewUrl || uploaded.url || uploaded.publicUrl,
    file: attachment.file,
    metadata: {
      ...(attachment.metadata ?? {}),
      ...(uploaded.metadata ?? {}),
      ...(attachment.id ? { local_id: attachment.id } : {}),
      ...(attachment.source ? { source: attachment.source } : {})
    }
  };
}

export async function uploadChatAttachments(attachments: ChatAttachmentDraft[]) {
  const uploaded: ChatAttachmentDraft[] = [];

  for (const attachment of attachments) {
    uploaded.push(await uploadChatAttachment(attachment));
  }

  return uploaded;
}

function getRecordValue(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

function toOptionalNumber(value: unknown) {
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeQuickActionCategory(item: unknown, index: number): ChatQuickActionItem | null {
  if (!item || typeof item !== "object") {
    return null;
  }

  const record = item as Record<string, unknown>;
  const enabled = getRecordValue(record, "enabled") ?? getRecordValue(record, "isEnabled");
  const status = getRecordValue(record, "status");

  if (enabled === false || status === "disabled") {
    return null;
  }

  const rawLabel = getRecordValue(record, "label") ?? getRecordValue(record, "name") ?? getRecordValue(record, "title");
  const label = typeof rawLabel === "string" ? rawLabel.trim() : "";

  if (!label) {
    return null;
  }

  const rawPrompt = getRecordValue(record, "prompt") ?? getRecordValue(record, "description");
  const rawId = getRecordValue(record, "id") ?? getRecordValue(record, "key") ?? label;
  const sortOrder = toOptionalNumber(getRecordValue(record, "sortOrder") ?? getRecordValue(record, "order") ?? getRecordValue(record, "position"));
  const rawDescription = getRecordValue(record, "description");
  const rawIcon = getRecordValue(record, "icon");
  const rawType = getRecordValue(record, "type");
  const rawAction = getRecordValue(record, "action");
  const fastModeAction = label === "快速";

  return {
    id: `category-${String(rawId)}-${index}`,
    label,
    prompt: fastModeAction ? null : typeof rawPrompt === "string" && rawPrompt.trim() ? rawPrompt.trim() : label,
    kind: fastModeAction ? "mode" : "category",
    mode: fastModeAction ? "fast" : undefined,
    sortOrder,
    description: typeof rawDescription === "string" ? rawDescription : null,
    icon: typeof rawIcon === "string" ? rawIcon : null,
    type: typeof rawType === "string" ? rawType : null,
    action: typeof rawAction === "string" ? rawAction : null
  };
}

async function fetchCategoryEndpoint(path: string) {
  const response = await fetch(path, {
    method: "GET"
  }).catch(() => null);

  if (!response) {
    return [];
  }

  if (!response.ok) {
    return [];
  }

  const payload = await response.json().catch(() => null) as ApiEnvelope<{
    categories?: unknown[];
    quickActions?: unknown[];
  }> | null;
  const categories = Array.isArray(payload?.data?.quickActions)
    ? payload.data.quickActions
    : Array.isArray(payload?.data?.categories)
      ? payload.data.categories
      : [];

  return categories
    .map(normalizeQuickActionCategory)
    .filter((item): item is ChatQuickActionItem => Boolean(item))
    .sort((left, right) => {
      const leftOrder = left.sortOrder ?? indexFallback(left.id);
      const rightOrder = right.sortOrder ?? indexFallback(right.id);

      return leftOrder - rightOrder || left.label.localeCompare(right.label, "zh-CN");
    });
}

function indexFallback(id: string) {
  const value = Number(id.match(/-(\d+)-/)?.[1] ?? Number.MAX_SAFE_INTEGER);

  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

export async function fetchQuickActionCategories() {
  return fetchCategoryEndpoint("/api/user/quick-actions");
}

export async function fetchCurrentChatUser() {
  const response = await fetch("/api/auth/me", {
    method: "GET"
  });

  return readApiResponse<CurrentUserResponse>(response);
}

export async function logoutCurrentChatUser() {
  const response = await fetch("/api/auth/logout", {
    method: "POST"
  });

  return readApiResponse<{ signedOut: true }>(response);
}

export async function changeCurrentUserPassword(input: ChangePasswordInput) {
  const response = await fetch("/api/auth/change-password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      current_password: input.currentPassword,
      new_password: input.newPassword,
      confirm_password: input.confirmPassword
    })
  });

  return readApiResponse<ChangePasswordResponse>(response);
}

export async function updateCurrentUserAvatar(file: File) {
  const formData = new FormData();

  formData.set("avatar", file);
  formData.set("file", file);

  const response = await fetch("/api/auth/avatar", {
    method: "POST",
    body: formData
  });

  return readApiResponse<AvatarUpdateResponse>(response);
}
