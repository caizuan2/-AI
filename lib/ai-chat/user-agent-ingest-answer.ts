import "server-only";

import type { RagContext, RagRecentConversationTurn } from "@/lib/ai/rag-prompt";
import type {
  GptIngestKnowledgeContext,
  GptIngestMemoryAttachment
} from "@/lib/enterprise/gpt-ingest-memory";
import { runAdminIngestWithSelectedModel } from "@/lib/enterprise/ingest-model-provider";
import {
  getUserAnswerModelOption,
  type UserAnswerModelProvider
} from "@/lib/ai-chat/user-answer-model";

export const USER_AGENT_INGEST_OUTPUT_MODE = "admin_ingest_reply_markdown" as const;

export interface UserAgentIngestAnswerInput {
  originalQuestion: string;
  contexts: RagContext[];
  recentConversation: RagRecentConversationTurn[];
  agentId: string;
  agentName: string;
  agentCategory: string;
  agentDescription: string;
  businessExecutionContext?: string | null;
  modelProvider: UserAnswerModelProvider;
  userId: string;
  requestId: string;
  signal?: AbortSignal;
}

export interface UserAgentIngestAnswerResult {
  answer: string;
  providerUsed: string;
  modelUsed: string;
  fallbackUsed: boolean;
  answerOutputMode: typeof USER_AGENT_INGEST_OUTPUT_MODE;
}

function normalizeSourceType(context: RagContext) {
  return (context.sourceType ?? "").trim().toLowerCase();
}

function toFixedKnowledgeContexts(
  contexts: RagContext[],
  agentName: string
): GptIngestKnowledgeContext[] {
  return contexts
    .filter((context) => {
      const sourceType = normalizeSourceType(context);
      return sourceType !== "runtime_memory" && sourceType !== "attachment_ocr";
    })
    .slice(0, 8)
    .map((context) => ({
      id: context.id,
      title: context.title || context.sourceTitle || `${agentName}知识资料`,
      content: context.content,
      sourceId: context.sourceId ?? null,
      score: context.score ?? context.relevance_score ?? context.similarity ?? null
    }));
}

function toRuntimeMemory(contexts: RagContext[], agentName: string) {
  const memories = contexts
    .filter((context) => normalizeSourceType(context) === "runtime_memory")
    .slice(0, 4);

  return {
    memoryContextText: memories.length > 0
      ? memories.map((context, index) => [
          `### 已发布长期记忆 ${index + 1}: ${context.title || context.sourceTitle || `${agentName}训练记忆`}`,
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
      fileName: context.sourceTitle || context.title || `用户上传附件 ${index + 1}`,
      fileType: "image",
      parseStatus: "parsed",
      extractedText: context.content,
      summary: context.summary
    }));
}

function buildUserAgentLearningInstruction(input: UserAgentIngestAnswerInput) {
  return [
    "[USER_AGENT_ANSWER]",
    `当前 Agent：${input.agentName}`,
    `当前问题：${input.originalQuestion}`,
    "",
    "回答要求：",
    "- 只依据当前 Agent 固定知识库召回、当前 Agent 已发布长期记忆、用户附件和最近对话回答。",
    "- 不得引用、混入或推断其他 Agent 的知识库内容。",
    "- 知识依据不足时如实说明，不得把通用推断伪装成知识库结论。",
    "- 直接输出完整、自然的 Markdown 正文，不输出 JSON、内部元数据、模型路由或后台处理过程。",
    "- 保留所选模型自然形成的标题、段落、列表、引用、加粗和代码块，不套用户端二次正文模板。",
    input.businessExecutionContext
      ? `\n当前用户端场景补充：\n${input.businessExecutionContext.slice(0, 2400)}`
      : ""
  ].filter(Boolean).join("\n").slice(0, 4200);
}

export async function runUserAgentIngestAnswer(
  input: UserAgentIngestAnswerInput
): Promise<UserAgentIngestAnswerResult> {
  const modelOption = getUserAnswerModelOption(input.modelProvider);
  const knowledgeContexts = toFixedKnowledgeContexts(input.contexts, input.agentName);
  const runtimeMemory = toRuntimeMemory(input.contexts, input.agentName);
  const attachments = toAttachmentContexts(input.contexts);
  const result = await runAdminIngestWithSelectedModel({
    input: input.originalQuestion,
    attachments,
    agentId: input.agentId || "xiaodong-ai",
    expertId: input.agentId || "xiaodong-ai",
    agentName: input.agentName,
    category: input.agentCategory,
    agentDescription: input.agentDescription,
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
    agentLearningInstruction: buildUserAgentLearningInstruction(input),
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
    answerOutputMode: USER_AGENT_INGEST_OUTPUT_MODE
  };
}
