import "server-only";

import { apiSuccess, databaseConfigError } from "@/lib/api-response";
import { requireTeamOsAccess } from "@/apps/team-os/features/auth/services/team-os-access";
import { RateLimitError } from "@/lib/errors";
import { getRequestIdFromHeaders } from "@/lib/logger";
import { checkPersistentRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { hasDatabaseUrl } from "@/lib/server-config";
import {
  assertBusinessInsightAccess,
  resolveAnalyticsAccess
} from "@/apps/team-os/features/analytics/services/analytics-access";
import { generateBusinessInsightForUser } from "@/apps/team-os/features/analytics/services/analytics-insight";
import {
  parseAnalyticsQuery,
  parseBusinessInsightInput
} from "@/apps/team-os/features/analytics/utils/analytics-input";
import {
  generateDashboard,
  getAIAnalytics,
  getCRMAnalytics,
  getTeamMetrics,
  getTrainingAnalytics
} from "@/apps/team-os/services/analytics/analytics-service";
import { createTeamOsApiErrorHandler } from "@/apps/team-os/features/production/services/error-handler";
import { readTeamOsJson as readJson } from "@/apps/team-os/features/production/services/production-http";

const apiError = createTeamOsApiErrorHandler("ANALYTICS");

function queryFromRequest(request: Request) {
  return parseAnalyticsQuery(new URL(request.url).searchParams);
}

export async function handleAnalyticsDashboardGet(request: Request) {
  try {
    const user = await requireTeamOsAccess(request, "analytics");
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("读取企业分析数据"));
    return apiSuccess(await generateDashboard(user.id, queryFromRequest(request)));
  } catch (error) {
    return apiError(error);
  }
}

export async function handleTeamAnalyticsGet(request: Request) {
  try {
    const user = await requireTeamOsAccess(request, "analytics");
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("读取团队分析数据"));
    return apiSuccess(await getTeamMetrics(user.id, queryFromRequest(request)));
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCrmAnalyticsGet(request: Request) {
  try {
    const user = await requireTeamOsAccess(request, "analytics");
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("读取 CRM 分析数据"));
    return apiSuccess(await getCRMAnalytics(user.id, queryFromRequest(request)));
  } catch (error) {
    return apiError(error);
  }
}

export async function handleTrainingAnalyticsGet(request: Request) {
  try {
    const user = await requireTeamOsAccess(request, "analytics");
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("读取培训分析数据"));
    return apiSuccess(await getTrainingAnalytics(user.id, queryFromRequest(request)));
  } catch (error) {
    return apiError(error);
  }
}

export async function handleAiAnalyticsGet(request: Request) {
  try {
    const user = await requireTeamOsAccess(request, "analytics");
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("读取 AI 运营分析数据"));
    return apiSuccess(await getAIAnalytics(user.id, queryFromRequest(request)));
  } catch (error) {
    return apiError(error);
  }
}

export async function handleBusinessInsightPost(request: Request) {
  try {
    const user = await requireTeamOsAccess(request, "analytics");
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("生成 AI 经营建议"));
    const input = parseBusinessInsightInput(await readJson(request));
    const access = await resolveAnalyticsAccess(user.id, input.companyId);
    assertBusinessInsightAccess(access);
    const rateLimit = await checkPersistentRateLimit(request, {
      namespace: "team-os-analytics-insight",
      userId: user.id,
      limit: 6,
      globalLimit: 120,
      windowMs: 10 * 60 * 1_000
    });
    if (!rateLimit.allowed) {
      throw new RateLimitError(`AI 经营分析请求过于频繁，请 ${rateLimit.retryAfterSeconds} 秒后再试。`);
    }
    const result = await generateBusinessInsightForUser(
      user.id,
      input,
      getRequestIdFromHeaders(request.headers)
    );
    return apiSuccess(result, { headers: rateLimitHeaders(rateLimit) });
  } catch (error) {
    return apiError(error);
  }
}
