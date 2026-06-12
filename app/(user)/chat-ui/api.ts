import { createAskRequestPayload } from "./chat-ui-state";
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

export const USER_CHAT_LOGIN_URL = "/login?app=user&next=/chat-ui";

type ApiEnvelope<T> = {
  ok?: boolean;
  success?: boolean;
  data?: T;
  error?: {
    message?: string;
  };
  message?: string;
};

async function readApiResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;

  if (!response.ok || !payload?.ok) {
    if (response.status === 401) {
      throw new Error("请先登录后再继续使用 AI 知识库助手。");
    }

    if (response.status === 403) {
      throw new Error("当前账号没有权限访问该功能。");
    }

    throw new Error(payload?.error?.message || payload?.message || "请求失败，请稍后重试。");
  }

  if (!payload.data) {
    throw new Error("接口返回数据为空。");
  }

  return payload.data;
}

export async function askChat(input: AskChatRequest) {
  const response = await fetch("/api/ai/chat/ask", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(createAskRequestPayload(input))
  });

  return readApiResponse<AskChatResponse>(response);
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

  const response = await fetch("/api/ai/chat/attachments", {
    method: "POST",
    body: formData
  });
  const result = await readApiResponse<ChatAttachmentUploadResponse>(response);
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
