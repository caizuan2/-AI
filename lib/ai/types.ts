import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export type ChatProviderName = "qwen" | "openai" | "deepseek";
export type EmbeddingProviderName = "openai";
export type ProviderUsage = Record<string, unknown>;

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatProviderInput = {
  system?: string;
  messages: ChatMessage[];
  model?: string;
  providerChain?: ChatProviderName[];
  temperature?: number;
  maxTokens?: number;
  requestId?: string;
};

export type ChatProviderResult = {
  text: string;
  usage?: ProviderUsage;
  provider: ChatProviderName;
  model: string;
};

export type ModelFeedbackEvent = {
  model_used: string;
  was_successful: boolean;
  fallback_triggered: boolean;
  response_quality: number | null;
  latency: number;
};

export type ChatWithFallbackResult = ChatProviderResult & {
  fallbackUsed: boolean;
  originalProviderErrorCode?: string;
  model_feedback_event: ModelFeedbackEvent;
};

export type EmbeddingProviderInput = {
  texts: string[];
  requestId?: string;
};

export type EmbeddingProviderResult = {
  vectors: number[][];
  usage?: ProviderUsage;
  provider: EmbeddingProviderName;
  model: string;
};

export type ChatProvider = {
  name: ChatProviderName;
  model: string;
  chat(input: ChatProviderInput): Promise<ChatProviderResult>;
};

export type EmbeddingProvider = {
  name: EmbeddingProviderName;
  model: string;
  embed(input: EmbeddingProviderInput): Promise<EmbeddingProviderResult>;
};

export function toOpenAIChatMessages(input: ChatProviderInput): ChatCompletionMessageParam[] {
  const messages: ChatMessage[] = input.system
    ? [{ role: "system", content: input.system }, ...input.messages]
    : input.messages;

  return messages.map((message) => ({
    role: message.role,
    content: message.content
  }));
}
