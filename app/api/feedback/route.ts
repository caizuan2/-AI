import { FeedbackType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { requireLicensedUser } from "@/lib/auth/guards";
import { RateLimitError, ValidationError } from "@/lib/errors";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { hasDatabaseUrl } from "@/lib/server-config";

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
  } catch (error) {
    return apiError(error);
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
