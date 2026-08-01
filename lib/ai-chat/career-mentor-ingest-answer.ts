import "server-only";

import type { RagContext, RagRecentConversationTurn } from "@/lib/ai/rag-prompt";
import {
  buildCareerMentorDeepSeekDirection,
  type CareerMentorKnowledgeMode,
  type CareerMentorStage
} from "@/lib/ai-chat/career-mentor";
import { loadCareerMentorFixedRuleContexts } from "@/lib/ai-chat/career-mentor-fixed-rules";
import type {
  GptIngestKnowledgeContext,
  GptIngestMemoryAttachment
} from "@/lib/enterprise/gpt-ingest-memory";
import { runAdminIngestWithSelectedModel } from "@/lib/enterprise/ingest-model-provider";
import {
  getUserAnswerModelOption,
  type UserAnswerModelProvider
} from "@/lib/ai-chat/user-answer-model";

export const CAREER_MENTOR_INGEST_OUTPUT_MODE = "admin_ingest_reply_markdown" as const;

export interface CareerMentorIngestAnswerInput {
  originalQuestion: string;
  scenarioQuestion: string;
  careerMentorStage: CareerMentorStage;
  contexts: RagContext[];
  recentConversation: RagRecentConversationTurn[];
  agentId: string;
  modelProvider: UserAnswerModelProvider;
  userId: string;
  requestId: string;
  signal?: AbortSignal;
}

export interface CareerMentorIngestAnswerResult {
  answer: string;
  providerUsed: string;
  modelUsed: string;
  fallbackUsed: boolean;
  answerOutputMode: typeof CAREER_MENTOR_INGEST_OUTPUT_MODE;
}

function normalizeSourceType(context: RagContext) {
  return (context.sourceType ?? "").trim().toLowerCase();
}

function toFixedKnowledgeContexts(contexts: RagContext[]): GptIngestKnowledgeContext[] {
  return contexts
    .filter((context) => {
      const sourceType = normalizeSourceType(context);
      return sourceType !== "runtime_memory" && sourceType !== "attachment_ocr";
    })
    .slice(0, 6)
    .map((context) => ({
      id: context.id,
      title: context.title || context.sourceTitle || "讲事业导师知识资料",
      content: context.content,
      sourceId: context.sourceId ?? null,
      score: context.score ?? context.relevance_score ?? context.similarity ?? null
    }));
}

function toRuntimeMemory(contexts: RagContext[]) {
  const memories = contexts
    .filter((context) => normalizeSourceType(context) === "runtime_memory")
    .slice(0, 4);

  return {
    memoryContextText: memories.length > 0
      ? memories.map((context, index) => [
          `### 已发布长期记忆 ${index + 1}: ${context.title || context.sourceTitle || "讲事业训练记忆"}`,
          context.content
        ].join("\n")).join("\n\n")
      : null,
    usedMemoryIds: memories.map((context) => context.id.replace(/^runtime-memory:/, ""))
  };
}

function toAttachmentContexts(contexts: RagContext[]): GptIngestMemoryAttachment[] {
  return contexts
    .filter((context) => normalizeSourceType(context) === "attachment_ocr")
    .slice(0, 4)
    .map((context, index) => ({
      fileName: context.sourceTitle || context.title || `用户上传截图 ${index + 1}`,
      fileType: "image",
      parseStatus: "parsed",
      extractedText: context.content,
      summary: context.summary
    }));
}

export async function runCareerMentorIngestAnswer(
  input: CareerMentorIngestAnswerInput
): Promise<CareerMentorIngestAnswerResult> {
  const fixedRuleContexts = loadCareerMentorFixedRuleContexts(input.careerMentorStage);
  const knowledgeContexts = [
    ...fixedRuleContexts,
    ...toFixedKnowledgeContexts(input.contexts)
  ];
  const runtimeMemory = toRuntimeMemory(input.contexts);
  const attachments = toAttachmentContexts(input.contexts);
  const knowledgeMode: CareerMentorKnowledgeMode = "knowledge_first";
  const agentLearningInstruction = buildCareerMentorDeepSeekDirection({
    originalQuestion: input.originalQuestion,
    scenarioQuestion: input.scenarioQuestion,
    stage: input.careerMentorStage,
    knowledgeMode
  });
  const modelOption = getUserAnswerModelOption(input.modelProvider);
  const result = await runAdminIngestWithSelectedModel({
    input: input.originalQuestion,
    attachments,
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
    preferredModel: modelOption.model,
    selectedModelLabel: modelOption.label,
    modelDisplayName: modelOption.label,
    strictModelAffinity: true,
    recentMessages: input.recentConversation.map((message) => ({
      role: message.role,
      content: message.content
    })),
    agentLearningInstruction,
    knowledgeContexts,
    memoryContextText: runtimeMemory.memoryContextText,
    usedMemoryIds: runtimeMemory.usedMemoryIds,
    requestId: input.requestId,
    signal: input.signal
  });

  return {
    answer: result.replyMarkdown || "",
    providerUsed: result.actualProvider || result.provider,
    modelUsed: result.actualModel || result.model,
    fallbackUsed: result.fallbackUsed,
    answerOutputMode: CAREER_MENTOR_INGEST_OUTPUT_MODE
  };
}
