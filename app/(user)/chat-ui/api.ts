import { createAskRequestPayload } from "./chat-ui-state";
import type {
  AskChatRequest,
  AskChatResponse,
  ConversationsResponse,
  HistoryResponse
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
