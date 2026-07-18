import "server-only";

import { apiSuccess, databaseConfigError } from "@/lib/api-response";
import { requireTeamOsAccess } from "@/apps/team-os/features/auth/services/team-os-access";
import { RateLimitError } from "@/lib/errors";
import { getRequestIdFromHeaders } from "@/lib/logger";
import { checkPersistentRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { hasDatabaseUrl } from "@/lib/server-config";
import {
  createTrainingSimulationForUser,
  evaluateTrainingForUser,
  recommendTrainingForUser,
  upsertTrainingCourseWithKnowledge
} from "@/apps/team-os/features/training/services/training-operations";
import {
  createTrainingAssignmentForUser,
  getTrainingCourseForUser,
  getTrainingDashboardForUser,
  getTrainingManagementForUser,
  listTrainingCoursesForUser,
  startTrainingCourseForUser
} from "@/apps/team-os/features/training/services/training-repository";
import {
  assertTrainingCourseEditor,
  resolveTrainingAccess
} from "@/apps/team-os/features/training/services/training-access";
import {
  parseCreateTrainingAssignmentInput,
  parseEvaluateTrainingInput,
  parseTrainingCompanyId,
  parseTrainingCourseFilters,
  parseTrainingCourseSelectionInput,
  parseUpdateTrainingRecordInput,
  parseUpsertTrainingCourseInput
} from "@/apps/team-os/features/training/utils/training-input";
import { createTeamOsApiErrorHandler } from "@/apps/team-os/features/production/services/error-handler";
import { readTeamOsJson as readJson } from "@/apps/team-os/features/production/services/production-http";

const apiError = createTeamOsApiErrorHandler("TRAINING");

async function enforceAiRateLimit(
  request: Request,
  input: { namespace: string; userId: string; limit: number; globalLimit: number }
) {
  const result = await checkPersistentRateLimit(request, {
    namespace: input.namespace,
    userId: input.userId,
    limit: input.limit,
    globalLimit: input.globalLimit,
    windowMs: 10 * 60 * 1_000
  });
  if (!result.allowed) {
    throw new RateLimitError(`AI 培训请求过于频繁，请 ${result.retryAfterSeconds} 秒后再试。`);
  }
  return result;
}

export async function handleTrainingCoursesGet(request: Request) {
  try {
    const user = await requireTeamOsAccess(request, "training");
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("读取培训课程"));
    const filters = parseTrainingCourseFilters(new URL(request.url).searchParams);
    return apiSuccess(await listTrainingCoursesForUser(user.id, filters));
  } catch (error) {
    return apiError(error);
  }
}

export async function handleTrainingCourseUpsert(request: Request) {
  try {
    const user = await requireTeamOsAccess(request, "training");
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("保存培训课程"));
    const input = parseUpsertTrainingCourseInput(await readJson(request));
    let headers: HeadersInit | undefined;
    if (input.generateFromKnowledge) {
      const access = await resolveTrainingAccess(user.id, input.companyId);
      assertTrainingCourseEditor(access);
      const rateLimit = await enforceAiRateLimit(request, {
        namespace: "team-os-training-course-generate",
        userId: user.id,
        limit: 6,
        globalLimit: 120
      });
      headers = rateLimitHeaders(rateLimit);
    }
    const result = await upsertTrainingCourseWithKnowledge(
      user.id,
      input,
      getRequestIdFromHeaders(request.headers)
    );
    return apiSuccess(result, { status: input.courseId ? 200 : 201, headers });
  } catch (error) {
    return apiError(error);
  }
}

export async function handleTrainingRecordsGet(request: Request) {
  try {
    const user = await requireTeamOsAccess(request, "training");
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("读取培训学习记录"));
    const companyId = parseTrainingCompanyId(new URL(request.url).searchParams);
    return apiSuccess(await getTrainingDashboardForUser(user.id, companyId));
  } catch (error) {
    return apiError(error);
  }
}

export async function handleTrainingRecordStart(request: Request) {
  try {
    const user = await requireTeamOsAccess(request, "training");
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("开始培训课程"));
    const input = parseUpdateTrainingRecordInput(await readJson(request));
    return apiSuccess(await startTrainingCourseForUser(user.id, input));
  } catch (error) {
    return apiError(error);
  }
}

export async function handleTrainingAssignmentsGet(request: Request) {
  try {
    const user = await requireTeamOsAccess(request, "training");
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("读取培训管理数据"));
    const companyId = parseTrainingCompanyId(new URL(request.url).searchParams);
    return apiSuccess(await getTrainingManagementForUser(user.id, companyId));
  } catch (error) {
    return apiError(error);
  }
}

export async function handleTrainingAssignmentCreate(request: Request) {
  try {
    const user = await requireTeamOsAccess(request, "training");
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("安排员工培训"));
    const input = parseCreateTrainingAssignmentInput(await readJson(request));
    return apiSuccess(await createTrainingAssignmentForUser(user.id, input), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function handleTrainingSimulationCreate(request: Request) {
  try {
    const user = await requireTeamOsAccess(request, "training");
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("生成 AI 模拟训练"));
    const input = parseTrainingCourseSelectionInput(await readJson(request));
    await getTrainingCourseForUser(user.id, input.courseId, { requireActive: true });
    const rateLimit = await enforceAiRateLimit(request, {
      namespace: "team-os-training-simulation",
      userId: user.id,
      limit: 12,
      globalLimit: 240
    });
    const result = await createTrainingSimulationForUser(
      user.id,
      input.courseId,
      getRequestIdFromHeaders(request.headers)
    );
    return apiSuccess(result, { headers: rateLimitHeaders(rateLimit) });
  } catch (error) {
    return apiError(error);
  }
}

export async function handleTrainingEvaluate(request: Request) {
  try {
    const user = await requireTeamOsAccess(request, "training");
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("执行 AI 培训评分"));
    const input = parseEvaluateTrainingInput(await readJson(request));
    await getTrainingCourseForUser(user.id, input.courseId, { requireActive: true });
    const rateLimit = await enforceAiRateLimit(request, {
      namespace: "team-os-training-evaluate",
      userId: user.id,
      limit: 20,
      globalLimit: 400
    });
    const result = await evaluateTrainingForUser(
      user.id,
      input,
      getRequestIdFromHeaders(request.headers)
    );
    return apiSuccess(result, { headers: rateLimitHeaders(rateLimit) });
  } catch (error) {
    return apiError(error);
  }
}

export async function handleTrainingRecommendGet(request: Request) {
  try {
    const user = await requireTeamOsAccess(request, "training");
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("生成个性化培训推荐"));
    const companyId = parseTrainingCompanyId(new URL(request.url).searchParams);
    await resolveTrainingAccess(user.id, companyId);
    const rateLimit = await enforceAiRateLimit(request, {
      namespace: "team-os-training-recommend",
      userId: user.id,
      limit: 6,
      globalLimit: 120
    });
    const result = await recommendTrainingForUser(
      user.id,
      companyId,
      getRequestIdFromHeaders(request.headers)
    );
    return apiSuccess(result, { headers: rateLimitHeaders(rateLimit) });
  } catch (error) {
    return apiError(error);
  }
}
