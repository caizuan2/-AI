import { apiError, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { handleAiChatAsk } from "@/lib/ai-chat/ask";
import {
  generateCareerMentorGroundedAnswer,
  type CareerMentorGroundedAnswerOptions,
  type CareerMentorGroundedAnswerResult
} from "@/lib/ai-chat/career-mentor-grounded-answer";
import { isCareerMentorScope } from "@/lib/ai-chat/career-mentor";
import { createAiChatSseResponse } from "@/lib/ai-chat/streaming";
import { generateRagAnswer, type GenerateRagAnswerOptions } from "@/lib/ai/rag-answer";
import { requireAiChatAccess } from "@/lib/auth/guards";
import { ValidationError } from "@/lib/errors";
import { GPT_OS_DEEPSEEK_PRO_MODEL } from "@/gpt-os/core/model_router";
import { getOrCreateUserSettings } from "@/lib/settings";
import {
  hasDatabaseUrl,
  hasUsableChatProvider,
  type ChatProviderName
} from "@/lib/server-config";
import type { RagConfidence } from "@/lib/rag/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHAT_PROVIDER_PRIORITY: ChatProviderName[] = ["deepseek", "qwen", "openai"];

function isChatProviderName(value: unknown): value is ChatProviderName {
  return value === "deepseek" || value === "qwen" || value === "openai";
}

function getFirstUsableProvider(value: string | null | undefined): ChatProviderName | null {
  if (isChatProviderName(value) && hasUsableChatProvider(value)) {
    return value;
  }

  return CHAT_PROVIDER_PRIORITY.find((candidate) => hasUsableChatProvider(candidate)) ?? null;
}

function normalizeProvider(value: string | null | undefined): ChatProviderName {
  return getFirstUsableProvider(value) ?? "openai";
}

function normalizeProviderChain(
  primary: string | null | undefined,
  providerChain: readonly unknown[] | undefined,
  fallbackProvider: ChatProviderName | null,
): ChatProviderName[] {
  const providers: ChatProviderName[] = [];
  const pushProvider = (candidate: unknown) => {
    if (!isChatProviderName(candidate) || providers.includes(candidate) || !hasUsableChatProvider(candidate)) {
      return;
    }
    providers.push(candidate);
  };

  pushProvider(primary);
  for (const candidate of providerChain ?? []) {
    pushProvider(candidate);
  }
  pushProvider(fallbackProvider);
  for (const candidate of CHAT_PROVIDER_PRIORITY) {
    pushProvider(candidate);
  }

  return providers;
}

function confidenceToNumber(confidence: RagConfidence) {
  if (confidence === "high") {
    return 0.82;
  }

  return confidence === "medium" ? 0.52 : 0.18;
}

function getSearchQuery(body: Record<string, unknown>) {
  const value = body.question ?? body.message ?? body.text;

  return typeof value === "string" ? value.trim() : "";
}

function getOptionalString(body: Record<string, unknown>, key: string) {
  const value = body[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(request: Request) {
  let actor: Awaited<ReturnType<typeof requireAiChatAccess>>;

  try {
    actor = await requireAiChatAccess(request, "ai_chat_ask");
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("进行用户端知识库问答"));
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError(new ValidationError("请求体必须是合法 JSON。"));
  }

  if (!isPlainObject(body)) {
    return apiError(new ValidationError("请求体必须是 JSON 对象。"));
  }

  return createAiChatSseResponse({
    signal: request.signal,
    producer: async ({ emit, streamResult }) => {
      await emit({
        type: "thinking",
        content: "分析问题中..."
      });

      const settings = await getOrCreateUserSettings(actor.id);
      const configuredProvider = getFirstUsableProvider(settings.preferredProvider);
      const providerConfigured = configuredProvider !== null;

      await emit({
        type: "thinking",
        content: "正在检索知识库..."
      });
      await emit({
        type: "rag_search",
        query: getSearchQuery(body)
      });

      const result = await handleAiChatAsk({
        id: actor.id,
        role: actor.role
      }, body, {
        providerConfigured,
        answerProvider: providerConfigured
          ? async ({
              question,
              contexts,
              mode,
              enableDeepThinking,
              confidence,
              actualModel,
              provider: requestedProvider,
              providerFallbackChain,
              businessExecutionContext,
              recentConversation,
              careerMentorStage,
              agentId,
              knowledgeBaseId,
              namespace
            }) => {
              const careerMentorNaturalBodyEnabled = isCareerMentorScope({
                agentId,
                knowledgeBaseId,
                namespace
              });
              const answerProvider = careerMentorNaturalBodyEnabled
                ? getFirstUsableProvider("deepseek") ?? configuredProvider ?? normalizeProvider(requestedProvider)
                : getFirstUsableProvider(requestedProvider) ?? configuredProvider ?? normalizeProvider(requestedProvider);
              const answerProviderChain = normalizeProviderChain(
                answerProvider,
                careerMentorNaturalBodyEnabled
                  ? ["deepseek", ...providerFallbackChain]
                  : providerFallbackChain,
                configuredProvider
              );
              const ragAnswerOptions = {
                userId: actor.id,
                provider: answerProvider,
                providerChain: answerProviderChain,
                model: careerMentorNaturalBodyEnabled
                  ? answerProvider === "deepseek"
                    ? GPT_OS_DEEPSEEK_PRO_MODEL
                    : undefined
                  : actualModel,
                agentId,
                knowledgeBaseId,
                namespace,
                answerMode: mode === "fast" && confidence !== "high" ? "partial" : "full",
                confidence: confidenceToNumber(confidence),
                intentLabel: enableDeepThinking ? "deep_thinking_enabled" : "standard",
                businessExecutionContext,
                recentConversation
              } satisfies GenerateRagAnswerOptions;
              const ragAnswer = careerMentorNaturalBodyEnabled
                ? await generateCareerMentorGroundedAnswer(question, contexts, {
                    ...ragAnswerOptions,
                    expectedStage: careerMentorStage ?? "unknown",
                    outputMode: "natural_markdown_with_cards",
                    temperature: 0.7,
                    maxTokens: 6000,
                    businessExecutionContextMaxChars: 7000
                  } satisfies CareerMentorGroundedAnswerOptions)
                : await generateRagAnswer(question, contexts, ragAnswerOptions);
              const careerEvidencePlan = careerMentorNaturalBodyEnabled
                ? (ragAnswer as CareerMentorGroundedAnswerResult).careerEvidencePlan
                : undefined;

              return {
                answer: ragAnswer.answer,
                providerUsed: ragAnswer.providerUsed,
                modelUsed: ragAnswer.model,
                fallbackUsed: ragAnswer.fallbackUsed,
                answerGroundingScore: ragAnswer.answer_grounding_score,
                modelFeedbackEvent: ragAnswer.model_feedback_event,
                originalProviderErrorCode: ragAnswer.originalProviderErrorCode,
                ...(careerEvidencePlan
                  ? { careerEvidencePlan }
                  : {})
              };
            }
          : undefined
      });

      await streamResult({
        ...result,
        runtime_input: {
          query: getSearchQuery(body),
          userId: actor.id,
          conversationId: getOptionalString(body, "conversationId") ?? getOptionalString(body, "conversation_id"),
          agentId: getOptionalString(body, "agentId") ?? getOptionalString(body, "agent_id"),
          expertId: getOptionalString(body, "expertId") ?? getOptionalString(body, "expert_id"),
          knowledgeBaseId: getOptionalString(body, "knowledgeBaseId") ?? getOptionalString(body, "knowledge_base_id"),
          kbId: getOptionalString(body, "kbId") ?? getOptionalString(body, "kb_id"),
          namespace: getOptionalString(body, "namespace"),
          tenantId: getOptionalString(body, "tenantId") ?? getOptionalString(body, "tenant_id"),
          outputMode: getOptionalString(body, "outputMode") ?? getOptionalString(body, "mode"),
          appType: "user_app",
          channel: "chat-ui",
          platform: getOptionalString(body, "platform") ?? "web"
        }
      });
    }
  });
}
