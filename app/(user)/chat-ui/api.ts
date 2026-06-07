import { createAskRequestPayload } from "./chat-ui-state";
import type {
  AskChatRequest,
  AskChatResponse,
  ConversationsResponse,
  CurrentUserResponse,
  HistoryResponse,
  ChatQuickActionItem
} from "./types";

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

  return {
    id: `category-${String(rawId)}-${index}`,
    label,
    prompt: typeof rawPrompt === "string" && rawPrompt.trim() ? rawPrompt.trim() : label,
    kind: "category",
    sortOrder
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
  }> | null;
  const categories = Array.isArray(payload?.data?.categories) ? payload.data.categories : [];

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
  for (const endpoint of ["/api/user/categories", "/api/categories"]) {
    const categories = await fetchCategoryEndpoint(endpoint);

    if (categories.length > 0) {
      return categories;
    }
  }

  return [];
}

export async function fetchCurrentChatUser() {
  const response = await fetch("/api/auth/me", {
    method: "GET"
  });

  return readApiResponse<CurrentUserResponse>(response);
}
