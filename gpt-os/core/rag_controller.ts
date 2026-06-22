import type { RagContext } from "@/lib/ai/rag-prompt";
import {
  getTopKForMode,
  hasPromptInjectionRisk,
  type AiChatMode,
  type RetrievedRagChunk
} from "@/lib/rag/search";

export interface RagControllerInput {
  query: string;
  mode: AiChatMode;
}

export interface RagControllerPlan {
  topK: number;
  promptInjectionRisk: boolean;
}

export interface RagControllerDiagnostics {
  rag_topK: number;
  hitCount: number;
  contextChars: number;
}

export function createRagControllerPlan(input: RagControllerInput): RagControllerPlan {
  return {
    topK: getTopKForMode(input.mode),
    promptInjectionRisk: hasPromptInjectionRisk(input.query),
  };
}

export function buildRagControllerDiagnostics(
  plan: RagControllerPlan,
  chunks: RetrievedRagChunk[],
  contexts: RagContext[],
): RagControllerDiagnostics {
  return {
    rag_topK: plan.topK,
    hitCount: chunks.length,
    contextChars: contexts.reduce((total, context) => total + context.content.length, 0),
  };
}
