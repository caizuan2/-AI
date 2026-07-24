import { apiError, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { handleAiChatAsk } from "@/lib/ai-chat/ask";
import { runCareerMentorIngestAnswer } from "@/lib/ai-chat/career-mentor-ingest-answer";
import { isCareerMentorScope } from "@/lib/ai-chat/career-mentor";
import { runUserAgentIngestAnswer } from "@/lib/ai-chat/user-agent-ingest-answer";
import { createAiChatSseResponse } from "@/lib/ai-chat/streaming";
import {
  DEFAULT_USER_ANSWER_MODEL_PROVIDER,
  parseUserAnswerModelProvider
} from "@/lib/ai-chat/user-answer-model";
import { requireAiChatAccess } from "@/lib/auth/guards";
import { ValidationError } from "@/lib/errors";
import { hasDatabaseUrl } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSearchQuery(body: Record<string, unknown>) {
  const value = body.question ?? body.message ?? body.text;

  return typeof value === "string" ? value.trim() : "";
}

function getOptionalString(body: Record<string, unknown>, key: string) {
  const value = body[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getNestedString(
  record: Record<string, unknown> | null,
  ...keys: string[]
) {
  if (!record) {
    return null;
  }

  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function getUserAgentPresentation(
  body: Record<string, unknown>,
  agentId: string,
  knowledgeBaseId: string
) {
  const activeKnowledgeBase = isPlainObject(body.activeKnowledgeBase)
    ? body.activeKnowledgeBase
    : null;
  const normalizedScope = `${agentId} ${knowledgeBaseId}`.toLowerCase();
  const knownProfile = /expert-kks|slim-kks|kb-kks/.test(normalizedScope)
    ? {
        name: "瘦身KKS专业师",
        category: "健康管理",
        description: "基于瘦身KKS专家知识库提供完整、可执行的用户回答。"
      }
    : /expert-health|health-expert|kb-health/.test(normalizedScope)
      ? {
          name: "大健康专家",
          category: "大健康",
          description: "基于大健康专家知识库提供完整、可执行的用户回答。"
        }
      : null;
  const title = getNestedString(activeKnowledgeBase, "expertName", "title", "name");

  return {
    agentName: knownProfile?.name || title || "小董AI",
    agentCategory: knownProfile?.category
      || getNestedString(activeKnowledgeBase, "category")
      || "知识问答",
    agentDescription: knownProfile?.description
      || getNestedString(activeKnowledgeBase, "description")
      || "基于当前用户选择的 Agent 知识库生成完整、自然的回答。"
  };
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

  const requestedAnswerModel = body.answer_model_provider ?? body.answerModelProvider;
  const selectedAnswerModelProvider = requestedAnswerModel === undefined || requestedAnswerModel === null
    ? DEFAULT_USER_ANSWER_MODEL_PROVIDER
    : parseUserAnswerModelProvider(requestedAnswerModel);

  if (!selectedAnswerModelProvider) {
    return apiError(new ValidationError("用户端回答模型只支持 DeepSeek-V4-Pro 或 Doubao-Seed-2.1-pro。"));
  }

  return createAiChatSseResponse({
    signal: request.signal,
    producer: async ({ emit, streamResult }) => {
      await emit({
        type: "thinking",
        content: "分析问题中..."
      });

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
        answerProvider: async ({
          question,
          originalQuestion,
          contexts,
          traceId,
          businessExecutionContext,
          recentConversation,
          agentId,
          knowledgeBaseId,
          namespace,
          careerMentorStage
        }) => {
          const careerMentorNaturalBodyEnabled = isCareerMentorScope({
            agentId,
            knowledgeBaseId,
            namespace
          });

          if (careerMentorNaturalBodyEnabled) {
            return runCareerMentorIngestAnswer({
              originalQuestion,
              scenarioQuestion: question,
              careerMentorStage: careerMentorStage ?? "unknown",
              contexts,
              recentConversation,
              agentId,
              modelProvider: selectedAnswerModelProvider,
              userId: actor.id,
              requestId: traceId,
              signal: request.signal
            });
          }

          const presentation = getUserAgentPresentation(body, agentId, knowledgeBaseId);

          return runUserAgentIngestAnswer({
                originalQuestion,
                contexts,
                recentConversation,
                agentId,
                ...presentation,
                businessExecutionContext,
                modelProvider: selectedAnswerModelProvider,
                userId: actor.id,
                requestId: traceId,
                signal: request.signal
          });
        },
        strictAnswerModelSelection: true,
        providerConfigured: true
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
          answerModelProvider: selectedAnswerModelProvider,
          appType: "user_app",
          channel: "chat-ui",
          platform: getOptionalString(body, "platform") ?? "web"
        }
      });
    }
  });
}
