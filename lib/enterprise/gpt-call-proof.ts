export interface OpenAIGptUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
}

export interface GptCallProof {
  provider: "openai" | "deepseek" | "doubao" | "qwen" | "kimi";
  endpoint: "/responses" | "/chat/completions";
  requestedModel: string;
  actualModel: string;
  responseId: string;
  proofId?: string;
  proofIdSource?: "provider_response_id" | "generated_from_provider_payload";
  fallback: boolean;
  requestTested: true;
  qualityPassed: boolean;
  deepenAttempts: number;
  createdAt?: string;
  usage?: OpenAIGptUsage;
}
