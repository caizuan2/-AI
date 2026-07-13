import "server-only";

import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { requireUserAppAccess } from "@/lib/auth/guards";
import { RateLimitError, ValidationError } from "@/lib/errors";
import { checkPersistentRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { hasDatabaseUrl } from "@/lib/server-config";
import {
  assertCanOptimizeAiBrain,
  assertCanReviewAiBrain,
  assertFeedbackTeam,
  resolveAiBrainAccess
} from "@/apps/team-os/features/ai-brain/services/ai-brain-access";
import {
  createKnowledgeFeedback,
  getAiBrainDashboard,
  listKnowledgeFeedback,
  listKnowledgeOptimizations
} from "@/apps/team-os/features/ai-brain/services/ai-brain-repository";
import { knowledgeExtractorService } from "@/apps/team-os/features/ai-brain/services/knowledge-extractor-service";
import { knowledgeOptimizationService } from "@/apps/team-os/features/ai-brain/services/knowledge-optimization-service";
import { reviewKnowledgeCandidate } from "@/apps/team-os/features/ai-brain/services/knowledge-review-service";
import {
  parseBrainListQuery,
  parseCandidateQuery,
  parseExtractKnowledgeInput,
  parseKnowledgeFeedbackInput,
  parseOptimizeKnowledgeInput,
  parseReviewKnowledgeInput
} from "@/apps/team-os/features/ai-brain/utils/ai-brain-input";

const MAX_BODY_BYTES = 64 * 1024;

async function readJson(request: Request) {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    throw new ValidationError("请求内容不能超过 64 KiB。");
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    throw new ValidationError("请求内容不能超过 64 KiB。");
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new ValidationError("请求体必须是合法 JSON 对象。");
  }
}

async function rateLimit(request: Request, input: {
  namespace: string;
  userId: string;
  limit: number;
  globalLimit: number;
  windowMs: number;
  message: string;
}) {
  const result = await checkPersistentRateLimit(request, input);
  if (!result.allowed) {
    throw new RateLimitError(`${input.message}，请 ${result.retryAfterSeconds} 秒后再试。`);
  }
  return result;
}

export async function handleAiBrainCandidatesGet(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("读取企业 AI Brain"));
    const query = parseCandidateQuery(new URL(request.url).searchParams);
    const access = await resolveAiBrainAccess(user.id, query.companyId);
    return apiSuccess(await getAiBrainDashboard(access, query));
  } catch (error) {
    return apiError(error);
  }
}

export async function handleAiBrainExtractPost(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("提取企业知识候选"));
    const input = parseExtractKnowledgeInput(await readJson(request));
    const access = await resolveAiBrainAccess(user.id, input.companyId);
    const limited = await rateLimit(request, {
      namespace: "team-os-ai-brain-extract",
      userId: user.id,
      limit: 20,
      globalLimit: 400,
      windowMs: 10 * 60 * 1_000,
      message: "知识提取请求过于频繁"
    });
    const candidate = await knowledgeExtractorService.extract(access, input);
    return apiSuccess(candidate, { status: 201, headers: rateLimitHeaders(limited) });
  } catch (error) {
    return apiError(error);
  }
}

export async function handleAiBrainFeedbackGet(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("读取企业知识反馈"));
    const query = parseBrainListQuery(new URL(request.url).searchParams);
    const access = await resolveAiBrainAccess(user.id, query.companyId);
    if (!access.isCompanyOwner && access.managerTeamIds.length === 0) {
      return apiSuccess({ context: access.context, items: [] });
    }
    return apiSuccess(await listKnowledgeFeedback(access, query.limit));
  } catch (error) {
    return apiError(error);
  }
}

export async function handleAiBrainFeedbackPost(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("提交企业知识反馈"));
    const input = parseKnowledgeFeedbackInput(await readJson(request));
    const access = await resolveAiBrainAccess(user.id, input.companyId);
    assertFeedbackTeam(access, input.teamId);
    const limited = await rateLimit(request, {
      namespace: "team-os-ai-brain-feedback",
      userId: user.id,
      limit: 30,
      globalLimit: 900,
      windowMs: 10 * 60 * 1_000,
      message: "知识反馈提交过于频繁"
    });
    const feedback = await createKnowledgeFeedback(access, user.id, input);
    return apiSuccess(feedback, { status: 201, headers: rateLimitHeaders(limited) });
  } catch (error) {
    return apiError(error);
  }
}

export async function handleAiBrainOptimizationGet(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("读取企业知识优化建议"));
    const query = parseBrainListQuery(new URL(request.url).searchParams);
    const access = await resolveAiBrainAccess(user.id, query.companyId);
    assertCanOptimizeAiBrain(access);
    return apiSuccess(await listKnowledgeOptimizations(access, query.limit));
  } catch (error) {
    return apiError(error);
  }
}

export async function handleAiBrainOptimizePost(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("生成企业知识优化建议"));
    const input = parseOptimizeKnowledgeInput(await readJson(request));
    const access = await resolveAiBrainAccess(user.id, input.companyId);
    assertCanOptimizeAiBrain(access);
    const limited = await rateLimit(request, {
      namespace: "team-os-ai-brain-optimize",
      userId: user.id,
      limit: 6,
      globalLimit: 120,
      windowMs: 10 * 60 * 1_000,
      message: "知识优化请求过于频繁"
    });
    const result = await knowledgeOptimizationService.generate({ access, actorUserId: user.id, request });
    return apiSuccess(result, { headers: rateLimitHeaders(limited) });
  } catch (error) {
    return apiError(error);
  }
}

export async function handleAiBrainReviewPost(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("审核企业候选知识"));
    const review = parseReviewKnowledgeInput(await readJson(request));
    const access = await resolveAiBrainAccess(user.id, review.companyId);
    assertCanReviewAiBrain(access);
    const limited = await rateLimit(request, {
      namespace: "team-os-ai-brain-review",
      userId: user.id,
      limit: 10,
      globalLimit: 200,
      windowMs: 10 * 60 * 1_000,
      message: "候选知识审核请求过于频繁"
    });
    const result = await reviewKnowledgeCandidate({ access, actorUserId: user.id, request, review });
    return apiSuccess(result.candidate, { headers: rateLimitHeaders(limited) });
  } catch (error) {
    return apiError(error);
  }
}
