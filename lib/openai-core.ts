import OpenAI from "openai";
import { env } from "@/lib/env";
import { AIError } from "@/lib/errors";

export interface OpenAIClientConfig {
  chatModel: string;
  embeddingModel: string;
}

export class OpenAIServiceError extends AIError {
  constructor(
    message = "AI 服务暂时不可用，请稍后重试。",
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "OpenAIServiceError";
  }
}

export const openaiConfig: OpenAIClientConfig = {
  chatModel: env.OPENAI_MODEL,
  embeddingModel: env.OPENAI_EMBEDDING_MODEL
};

export const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY
});

export function normalizeOpenAIError(error: unknown, fallbackMessage: string) {
  if (error instanceof OpenAI.APIError) {
    return new OpenAIServiceError(fallbackMessage, error);
  }

  if (error instanceof Error) {
    return new OpenAIServiceError(fallbackMessage, error);
  }

  return new OpenAIServiceError(fallbackMessage, error);
}
