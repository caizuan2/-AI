import { FeedbackType, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { apiError, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { requireLicensedUser } from "@/lib/auth/guards";
import { RateLimitError, ValidationError } from "@/lib/errors";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { hasDatabaseUrl } from "@/lib/server-config";
import { prisma } from "@/lib/prisma";
import {
  calculateBehaviorScoreSignal
} from "@/lib/enterprise/knowledge-behavior-calibration";
import {
  recordBehaviorSignal
} from "@/lib/enterprise/knowledge-governance";
import type {
  KnowledgeBehaviorEventType,
  KnowledgeBehaviorSignalInput
} from "@/lib/enterprise/knowledge-behavior-types";

export const dynamic = "force-dynamic";

const BEHAVIOR_RATE_LIMIT = {
  limit: 80,
  windowMs: 60_000
};

const BEHAVIOR_EVENTS = new Set<KnowledgeBehaviorEventType>([
  "answer_view",
  "answer_dwell",
  "answer_copy",
  "source_click",
  "save_knowledge",
  "follow_up_question",
  "regenerate_answer",
  "agent_switch",
  "second_question",
  "feedback_up",
  "feedback_down"
]);

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

function toMetadataValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
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

function parseEventType(value: unknown): KnowledgeBehaviorEventType {
  if (typeof value === "string" && BEHAVIOR_EVENTS.has(value as KnowledgeBehaviorEventType)) {
    return value as KnowledgeBehaviorEventType;
  }

  throw new ValidationError("无效的行为反馈类型。");
}

function parseBehaviorRequest(body: unknown): KnowledgeBehaviorSignalInput {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const eventType = parseEventType(body.eventType);
  const dwellMs = typeof body.dwellMs === "number" && Number.isFinite(body.dwellMs)
    ? Math.max(0, Math.round(body.dwellMs))
    : null;

  return {
    eventType,
    messageId: readOptionalString(body.messageId),
    conversationId: readOptionalString(body.conversationId),
    agentId: readOptionalString(body.agentId),
    knowledgeBaseId: readOptionalString(body.knowledgeBaseId),
    namespace: readOptionalString(body.namespace),
    chunkIds: readStringArray(body.chunkIds),
    evidenceIds: readStringArray(body.evidenceIds),
    dwellMs,
    source: body.source === "user_app" ? "user_app" : "admin_ingest",
    eventAt: new Date().toISOString(),
    metadata: isPlainObject(body.metadata) ? body.metadata : null
  };
}

function readMetadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function shouldDedupe(input: KnowledgeBehaviorSignalInput) {
  if (input.eventType === "regenerate_answer" || input.eventType === "agent_switch") {
    return { enabled: false, windowMs: 0 };
  }

  if (input.eventType === "answer_dwell") {
    return { enabled: true, windowMs: 5 * 60_000 };
  }

  return { enabled: true, windowMs: 30_000 };
}

async function findDuplicateBehavior(userId: string, input: KnowledgeBehaviorSignalInput) {
  const dedupe = shouldDedupe(input);

  if (!dedupe.enabled || !input.messageId) {
    return null;
  }

  const since = new Date(Date.now() - dedupe.windowMs);
  const candidates = await prisma.feedback.findMany({
    where: {
      userId,
      type: FeedbackType.SUGGESTION,
      createdAt: {
        gte: since
      }
    },
    orderBy: { createdAt: "desc" },
    take: 80,
    select: {
      id: true,
      metadata: true
    }
  });

  return candidates.find((candidate) => {
    const metadata = readMetadataRecord(candidate.metadata);

    return metadata.feedbackKind === "knowledge_behavior"
      && metadata.eventType === input.eventType
      && metadata.messageId === input.messageId
      && (metadata.source ?? "admin_ingest") === (input.source ?? "admin_ingest");
  }) ?? null;
}

function readUserTenantId(user: Awaited<ReturnType<typeof requireLicensedUser>>) {
  const tenantId = (user as { tenantId?: unknown }).tenantId;

  return typeof tenantId === "string" && tenantId.trim() ? tenantId.trim() : null;
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
        message: "请先登录后再记录行为"
      },
      { status: 401 }
    );
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("记录行为反馈"));
  }

  try {
    const rateLimit = checkRateLimit(request, {
      namespace: "api:feedback:behavior",
      userId: user.id,
      ...BEHAVIOR_RATE_LIMIT
    });

    if (!rateLimit.allowed) {
      return apiError(
        new RateLimitError(`行为反馈记录过于频繁，请 ${rateLimit.retryAfterSeconds} 秒后再试。`),
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

  let input: KnowledgeBehaviorSignalInput;

  try {
    input = {
      ...parseBehaviorRequest(body),
      userId: user.id,
      tenantId: readUserTenantId(user)
    };
  } catch (error) {
    return apiError(error);
  }

  try {
    const duplicate = await findDuplicateBehavior(user.id, input);
    const signal = calculateBehaviorScoreSignal(input);

    if (duplicate) {
      return NextResponse.json({
        success: true,
        status: "deduped",
        feedbackId: duplicate.id,
        eventType: input.eventType,
        behaviorScoreDelta: 0,
        rawBehaviorScoreDelta: signal.behaviorScoreDelta,
        reason: signal.reason,
        affectedChunkCount: 0,
        updatedChunkCount: 0
      });
    }

    const eventAt = input.eventAt instanceof Date ? input.eventAt.toISOString() : String(input.eventAt ?? new Date().toISOString());
    const behaviorMetadata = {
      feedbackKind: "knowledge_behavior",
      eventType: input.eventType,
      messageId: input.messageId,
      conversationId: input.conversationId,
      agentId: input.agentId,
      knowledgeBaseId: input.knowledgeBaseId,
      namespace: input.namespace,
      chunkIds: input.chunkIds ?? [],
      evidenceIds: input.evidenceIds ?? [],
      dwellMs: input.dwellMs ?? null,
      source: input.source ?? "admin_ingest",
      eventAt,
      behaviorReason: signal.reason,
      rawBehaviorScoreDelta: signal.behaviorScoreDelta,
      metadata: input.metadata ?? {}
    };
    const feedback = await prisma.feedback.create({
      data: {
        userId: user.id,
        type: FeedbackType.SUGGESTION,
        content: `行为反馈：${input.eventType}`,
        metadata: toMetadata(behaviorMetadata)
      },
      select: { id: true }
    });
    const governance = await recordBehaviorSignal({
      ...input,
      metadata: {
        ...(input.metadata ?? {}),
        feedbackId: feedback.id
      }
    });

    await prisma.feedback.update({
      where: { id: feedback.id },
      data: {
        metadata: toMetadata({
          ...behaviorMetadata,
          feedbackId: feedback.id,
          behaviorScoreDelta: governance.behaviorScoreDelta,
          rawBehaviorScoreDelta: governance.rawBehaviorScoreDelta,
          decayWeight: governance.decayWeight,
          avgTrustWeight: governance.avgTrustWeight,
          avgStabilityScore: governance.avgStabilityScore,
          affectedChunkCount: governance.affectedChunkCount,
          updatedChunkCount: governance.updatedChunkCount,
          updatedChunks: governance.updatedChunks
        })
      }
    });

    return NextResponse.json(
      {
        success: true,
        status: governance.status,
        feedbackId: feedback.id,
        eventType: input.eventType,
        behaviorScoreDelta: governance.behaviorScoreDelta,
        rawBehaviorScoreDelta: governance.rawBehaviorScoreDelta,
        decayWeight: governance.decayWeight,
        avgTrustWeight: governance.avgTrustWeight,
        avgStabilityScore: governance.avgStabilityScore,
        reason: governance.reason,
        affectedChunkCount: governance.affectedChunkCount,
        updatedChunkCount: governance.updatedChunkCount
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      {
        success: false,
        errorCode: "BEHAVIOR_FEEDBACK_SAVE_FAILED",
        message: "行为反馈保存失败"
      },
      { status: 500 }
    );
  }
}
