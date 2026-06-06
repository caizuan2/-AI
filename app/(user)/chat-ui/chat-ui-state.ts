import type { AskChatRequest, AskChatResponse, ChatMessageView, ChatMode } from "./types";

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

export function createAskRequestPayload(input: AskChatRequest) {
  const text = input.text.trim();

  return {
    question: text,
    text,
    attachments: input.attachments,
    conversation_id: input.conversation_id,
    mode: normalizeChatMode(input.mode),
    enable_deep_thinking: input.enable_deep_thinking,
    enable_web_search: input.enable_web_search
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
