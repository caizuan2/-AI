import OpenAI from "openai";
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

const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
const DEFAULT_OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";

let cachedOpenAI: OpenAI | null = null;

function readOpenAIKey() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new OpenAIServiceError("OpenAI API key 未配置，请在运行环境设置 OPENAI_API_KEY。");
  }

  return apiKey;
}

export const openaiConfig: OpenAIClientConfig = {
  get chatModel() {
    return process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
  },
  get embeddingModel() {
    return process.env.OPENAI_EMBEDDING_MODEL?.trim() || DEFAULT_OPENAI_EMBEDDING_MODEL;
  }
};

function getOpenAIClient() {
  if (!cachedOpenAI) {
    cachedOpenAI = new OpenAI({
      apiKey: readOpenAIKey()
    });
  }

  return cachedOpenAI;
}

export const openai = new Proxy({} as OpenAI, {
  get(_target, property, receiver) {
    return Reflect.get(getOpenAIClient(), property, receiver);
  }
});

export function normalizeOpenAIError(error: unknown, fallbackMessage: string) {
  if (error instanceof OpenAIServiceError) {
    return error;
  }

  if (error instanceof OpenAI.APIError) {
    return new OpenAIServiceError(fallbackMessage, error);
  }

  if (error instanceof Error) {
    return new OpenAIServiceError(fallbackMessage, error);
  }

  return new OpenAIServiceError(fallbackMessage, error);
}
