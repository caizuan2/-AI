import "server-only";

import type { RagContext, RagRecentConversationTurn } from "@/lib/ai/rag-prompt";
import { enhanceGPTStyle } from "@/lib/enterprise/gpt-os-style-layer";
import type { GptKnowledgeDraft } from "@/lib/enterprise/gpt-knowledge-draft";
import {
  resolveAdminIngestModelProvider,
  runAdminIngestWithSelectedModel
} from "@/lib/enterprise/ingest-model-provider";
import {
  DEEPSEEK_PRO_MODEL_ID,
  resolveIngestModelRuntime
} from "@/lib/enterprise/ingest-model-options";

export const CAREER_MENTOR_INGEST_OUTPUT_MODE = "admin_ingest_reply_markdown" as const;

export interface CareerMentorIngestAnswerInput {
  question: string;
  contexts: RagContext[];
  recentConversation: RagRecentConversationTurn[];
  agentId: string;
  userId: string;
  requestId: string;
}

export interface CareerMentorIngestAnswerResult {
  answer: string;
  providerUsed: string;
  modelUsed: string;
  fallbackUsed: boolean;
  answerOutputMode: typeof CAREER_MENTOR_INGEST_OUTPUT_MODE;
}

function toKnowledgeDrafts(contexts: RagContext[]): Array<Partial<GptKnowledgeDraft>> {
  return contexts.slice(0, 3).map((context) => ({
    title: context.title || context.sourceTitle || "讲事业导师知识资料",
    summary: context.summary || context.content,
    category: context.category || "讲事业导师",
    tags: context.tags ?? [],
    standardQuestion: context.title || "讲事业导师相关问题",
    standardAnswer: context.content,
    scenarios: context.category ? [context.category] : ["讲事业沟通"],
    sourceMaterials: [
      context.sourceTitle,
      context.sourceUrl,
      context.sourceType,
      context.id
    ].filter((value): value is string => Boolean(value))
  }));
}

export async function runCareerMentorIngestAnswer(
  input: CareerMentorIngestAnswerInput
): Promise<CareerMentorIngestAnswerResult> {
  const modelOption = resolveAdminIngestModelProvider({
    modelProvider: "deepseek-pro",
    preferredModel: DEEPSEEK_PRO_MODEL_ID,
    input: input.question,
    attachments: []
  });
  const modelRuntime = resolveIngestModelRuntime({
    provider: modelOption.provider,
    selectedModelLabel: modelOption.label,
    modelDisplayName: modelOption.displayName,
    preferredModel: DEEPSEEK_PRO_MODEL_ID
  });
  const result = await runAdminIngestWithSelectedModel({
    input: input.question,
    attachments: [],
    agentId: input.agentId,
    expertId: input.agentId,
    agentName: "讲事业导师",
    category: "学习教育",
    agentDescription: "把事业说明、会议内容和招商话术整理成可训练知识。",
    targetUser: null,
    userId: input.userId,
    tenantId: null,
    source: "admin_ingest",
    platform: "web",
    syncTarget: ["web", "exe", "apk"],
    modelProvider: modelOption.provider,
    preferredModel: modelRuntime.actualModel,
    selectedModelLabel: modelRuntime.displayModelLabel,
    modelDisplayName: modelRuntime.displayModelLabel,
    recentMessages: input.recentConversation.map((message) => ({
      role: message.role,
      content: message.content
    })),
    previousKnowledgeDrafts: toKnowledgeDrafts(input.contexts),
    requestId: input.requestId
  });
  const stylePassThrough = enhanceGPTStyle(result.replyMarkdown || "", {
    model: modelRuntime.actualModel,
    source: "admin_ingest_gpt_route",
    mode: "api_response"
  });

  return {
    answer: stylePassThrough.output,
    providerUsed: result.provider,
    modelUsed: result.actualModel || result.model,
    fallbackUsed: result.fallbackUsed,
    answerOutputMode: CAREER_MENTOR_INGEST_OUTPUT_MODE
  };
}
