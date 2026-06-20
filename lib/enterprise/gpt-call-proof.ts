export interface OpenAIGptUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
}

export interface GptCallProof {
  provider: "openai";
  endpoint: "/responses";
  requestedModel: string;
  actualModel: string;
  responseId: string;
  fallback: false;
  requestTested: true;
  qualityPassed: boolean;
  deepenAttempts: number;
  createdAt?: string;
  usage?: OpenAIGptUsage;
}
