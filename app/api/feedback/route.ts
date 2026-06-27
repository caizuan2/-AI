import { FeedbackType, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { requireLicensedUser } from "@/lib/auth/guards";
import { RateLimitError, ValidationError } from "@/lib/errors";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { hasDatabaseUrl } from "@/lib/server-config";
import {
  recordAnswerFeedback,
  type AnswerFeedbackRating
} from "@/lib/enterprise/knowledge-governance";

export const dynamic = "force-dynamic";

interface CreateFeedbackRequest {
  type: FeedbackType;
  content: string;
  metadata?: Prisma.InputJsonObject;
}

interface FeedbackResponse {
  id: string;
  type: FeedbackType;
  content: string;
  status: string;
  createdAt: string;
}

interface AnswerFeedbackRequest {
  messageId: string;
  agentId?: string | null;
  knowledgeBaseId?: string | null;
  namespace?: string | null;
  chunkIds: string[];
  evidenceIds: string[];
  rating: AnswerFeedbackRating;
  resolved?: boolean | null;
  question?: string | null;
  answerHash?: string | null;
  questionHash?: string | null;
  source: "admin_ingest" | "user_app";
}

const MAX_FEEDBACK_CONTENT_CHARS = 5000;
const MAX_METADATA_STRING_CHARS = 2000;
const FEEDBACK_RATE_LIMIT = {
  limit: 20,
  windowMs: 60_000
};
const allowedFeedbackTypes = new Set<string>(Object.values(FeedbackType));

function isFeedbackType(value: unknown): value is FeedbackType {
  return typeof value === "string" && allowedFeedbackTypes.has(value);
}

function isAnswerFeedbackRating(value: unknown): value is AnswerFeedbackRating {
  return value === "up" || value === "down";
}

function truncateMetadataString(value: string) {
  return value.length > MAX_METADATA_STRING_CHARS
    ? `${value.slice(0, MAX_METADATA_STRING_CHARS)}...`
    : value;
}

function toMetadataValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === null) {
    return undefined;
  }

  if (typeof value === "boolean" || typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return truncateMetadataString(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => toMetadataValue(item))
      .filter((item): item is Prisma.InputJsonValue => item !== undefined);
  }

  if (isPlainObject(value)) {
    return toMetadata(value);
  }

  return undefined;
}

function toMetadata(value: unknown): Prisma.InputJsonObject | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const metadata: Record<string, Prisma.InputJsonValue> = {};

  Object.entries(value).forEach(([key, item]) => {
    const normalized = toMetadataValue(item);

    if (normalized !== undefined) {
      metadata[key] = normalized;
    }
  });

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalString(value: unknown) {
  const text = readString(value);

  return text || null;
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? Array.from(new Set(value.map((item) => readString(item)).filter(Boolean))).slice(0, 30)
    : [];
}

function isAnswerFeedbackBody(body: unknown) {
  return isPlainObject(body) && ("rating" in body || "messageId" in body || "resolved" in body || "chunkIds" in body);
}

function parseAnswerFeedbackRequest(body: unknown): AnswerFeedbackRequest {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const messageId = readString(body.messageId);
  const rating = body.rating;

  if (!messageId) {
    throw new ValidationError("缺少 messageId，无法记录回答反馈。");
  }

  if (!isAnswerFeedbackRating(rating)) {
    throw new ValidationError("请选择有效的回答反馈类型。");
  }

  return {
    messageId,
    agentId: readOptionalString(body.agentId),
    knowledgeBaseId: readOptionalString(body.knowledgeBaseId),
    namespace: readOptionalString(body.namespace),
    chunkIds: readStringArray(body.chunkIds),
    evidenceIds: readStringArray(body.evidenceIds),
    rating,
    resolved: typeof body.resolved === "boolean" ? body.resolved : null,
    question: readOptionalString(body.question),
    answerHash: readOptionalString(body.answerHash),
    questionHash: readOptionalString(body.questionHash),
    source: body.source === "user_app" ? "user_app" : "admin_ingest"
  };
}

function readMetadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function findExistingAnswerFeedback(userId: string, input: AnswerFeedbackRequest) {
  const candidates = await prisma.feedback.findMany({
    where: {
      userId,
      type: {
        in: [FeedbackType.RAG_HELPFUL, FeedbackType.RAG_NOT_HELPFUL]
      }
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      metadata: true
    }
  });

  return candidates.find((candidate) => {
    const metadata = readMetadataRecord(candidate.metadata);

    return metadata.feedbackKind === "knowledge_answer"
      && metadata.messageId === input.messageId
      && (metadata.source ?? "admin_ingest") === input.source;
  }) ?? null;
}

function readUserTenantId(user: Awaited<ReturnType<typeof requireLicensedUser>>) {
  const tenantId = (user as { tenantId?: unknown }).tenantId;

  return typeof tenantId === "string" && tenantId.trim() ? tenantId.trim() : null;
}

function parseCreateFeedbackRequest(body: unknown): CreateFeedbackRequest {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const type = body.type;
  const content = typeof body.content === "string" ? body.content.trim() : "";

  if (!isFeedbackType(type)) {
    throw new ValidationError("请选择有效的反馈类型。");
  }

  if (!content) {
    throw new ValidationError("反馈内容不能为空。");
  }

  if (content.length > MAX_FEEDBACK_CONTENT_CHARS) {
    throw new ValidationError(`反馈内容过长，请控制在 ${MAX_FEEDBACK_CONTENT_CHARS} 字以内。`);
  }

  return {
    type,
    content,
    metadata: toMetadata(body.metadata)
  };
}

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof requireLicensedUser>>;

  try {
    user = await requireLicensedUser();
  } catch {
    return NextResponse.json(
      {
        success: false,
        errorCode: "UNAUTHORIZED",
        message: "请先登录后再反馈"
      },
      { status: 401 }
    );
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("提交反馈"));
  }

  try {
    const rateLimit = checkRateLimit(request, {
      namespace: "api:feedback:create",
      userId: user.id,
      ...FEEDBACK_RATE_LIMIT
    });

    if (!rateLimit.allowed) {
      return apiError(
        new RateLimitError(`反馈提交过于频繁，请 ${rateLimit.retryAfterSeconds} 秒后再试。`),
        { headers: rateLimitHeaders(rateLimit) }
      );
    }
  } catch (error) {
    return apiError(error);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError(new ValidationError("请求体必须是合法 JSON。"));
  }

  if (isAnswerFeedbackBody(body)) {
    let input: AnswerFeedbackRequest;

    try {
      input = parseAnswerFeedbackRequest(body);
    } catch (error) {
      return apiError(error);
    }

    try {
      const type = input.rating === "up" ? FeedbackType.RAG_HELPFUL : FeedbackType.RAG_NOT_HELPFUL;
      const feedbackAt = new Date().toISOString();
      const feedbackMetadata = {
        feedbackKind: "knowledge_answer",
        messageId: input.messageId,
        agentId: input.agentId,
        knowledgeBaseId: input.knowledgeBaseId,
        namespace: input.namespace,
        chunkIds: input.chunkIds,
        evidenceIds: input.evidenceIds,
        rating: input.rating,
        resolved: input.resolved,
        question: input.question,
        answerHash: input.answerHash,
        questionHash: input.questionHash,
        source: input.source,
        feedbackAt
      };
      const feedbackData = {
        type,
        content: [
          input.rating === "up" ? "AI回答有帮助" : "AI回答没帮助",
          input.resolved === true ? "已解决问题" : input.resolved === false ? "未解决问题" : null,
          input.question ? `问题：${truncateMetadataString(input.question)}` : null
        ].filter(Boolean).join("；"),
        metadata: toMetadata(feedbackMetadata)
      };
      const existingFeedback = await findExistingAnswerFeedback(user.id, input);
      const feedback = existingFeedback
        ? await prisma.feedback.update({
          where: { id: existingFeedback.id },
          data: feedbackData,
          select: { id: true }
        })
        : await prisma.feedback.create({
          data: {
          userId: user.id,
          ...feedbackData
          },
          select: { id: true }
        });
      const governance = await recordAnswerFeedback({
        userId: user.id,
        feedbackId: feedback.id,
        tenantId: readUserTenantId(user),
        feedbackAt,
        ...input
      });
      await prisma.feedback.update({
        where: { id: feedback.id },
        data: {
          metadata: toMetadata({
            ...feedbackMetadata,
            feedbackScoreDelta: governance.scoreDelta,
            rawScoreDelta: governance.rawScoreDelta,
            decayWeight: governance.decayWeight,
            avgTrustWeight: governance.avgTrustWeight,
            avgStabilityScore: governance.avgStabilityScore,
            affectedChunkCount: governance.affectedChunkCount,
            updatedChunkCount: governance.updatedChunkCount
          })
        }
      });

      return NextResponse.json(
        {
          success: true,
          status: governance.status,
          feedbackId: feedback.id,
          feedbackScoreDelta: governance.scoreDelta,
          decayWeight: governance.decayWeight,
          avgTrustWeight: governance.avgTrustWeight,
          avgStabilityScore: governance.avgStabilityScore,
          affectedChunkCount: governance.affectedChunkCount,
          scoreDelta: governance.scoreDelta,
          updatedChunkCount: governance.updatedChunkCount
        },
        { status: 201 }
      );
    } catch {
      return NextResponse.json(
        {
          success: false,
          errorCode: "FEEDBACK_SAVE_FAILED",
          message: "反馈保存失败"
        },
        { status: 500 }
      );
    }
  }

  let input: CreateFeedbackRequest;

  try {
    input = parseCreateFeedbackRequest(body);
  } catch (error) {
    return apiError(error);
  }

  try {
    const feedback = await prisma.feedback.create({
      data: {
        userId: user.id,
        type: input.type,
        content: input.content,
        metadata: input.metadata
      },
      select: {
        id: true,
        type: true,
        content: true,
        status: true,
        createdAt: true
      }
    });

    return apiSuccess<FeedbackResponse>(
      {
        ...feedback,
        createdAt: feedback.createdAt.toISOString()
      },
      { status: 201 }
    );
  } catch (error) {
    return apiError(error);
  }
}
