export interface OpenAIGptUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
}

export interface GptCallProof {
  provider: "openai" | "deepseek";
  endpoint: "/responses" | "/chat/completions";
  requestedModel: string;
  actualModel: string;
  responseId: string;
  proofId?: string;
  proofIdSource?: "provider_response_id" | "generated_from_provider_payload";
  fallback: false;
  requestTested: true;
  qualityPassed: boolean;
  deepenAttempts: number;
  createdAt?: string;
  usage?: OpenAIGptUsage;
}
