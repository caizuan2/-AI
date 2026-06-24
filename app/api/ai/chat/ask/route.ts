import { apiError, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { handleAiChatAsk } from "@/lib/ai-chat/ask";
import { createAiChatSseResponse } from "@/lib/ai-chat/streaming";
import { generateRagAnswer } from "@/lib/ai/rag-answer";
import { requireRole } from "@/lib/auth/guards";
import { ValidationError } from "@/lib/errors";
import { getOrCreateUserSettings } from "@/lib/settings";
import {
  hasDatabaseUrl,
  hasUsableChatProvider,
  type ChatProviderName
} from "@/lib/server-config";
import type { RagConfidence } from "@/lib/rag/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeProvider(value: string | null | undefined): ChatProviderName {
  return value === "openai" ? "openai" : "openai";
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

export async function POST(request: Request) {
  let actor: Awaited<ReturnType<typeof requireRole>>;

  try {
    actor = await requireRole("user", {
      request,
      requireLicense: true,
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "ai_chat_ask"
    });
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
      const provider = normalizeProvider(settings.preferredProvider);
      const providerConfigured = hasUsableChatProvider("deepseek")
        || hasUsableChatProvider("qwen")
        || hasUsableChatProvider("openai")
        || hasUsableChatProvider(provider);

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
              provider,
              providerFallbackChain,
              businessExecutionContext
            }) => {
              const ragAnswer = await generateRagAnswer(question, contexts, {
                userId: actor.id,
                provider,
                providerChain: providerFallbackChain,
                model: actualModel,
                answerMode: mode === "fast" && confidence !== "high" ? "partial" : "full",
                confidence: confidenceToNumber(confidence),
                intentLabel: enableDeepThinking ? "deep_thinking_enabled" : "standard",
                businessExecutionContext
              });

              return {
                answer: ragAnswer.answer,
                providerUsed: ragAnswer.providerUsed,
                modelUsed: ragAnswer.model,
                fallbackUsed: ragAnswer.fallbackUsed,
                answerGroundingScore: ragAnswer.answer_grounding_score,
                modelFeedbackEvent: ragAnswer.model_feedback_event,
                originalProviderErrorCode: ragAnswer.originalProviderErrorCode
              };
            }
          : undefined
      });

      await streamResult(result);
    }
  });
}
