import "server-only";

import { apiSuccess, databaseConfigError } from "@/lib/api-response";
import { requireUserAppAccess } from "@/lib/auth/guards";
import { RateLimitError } from "@/lib/errors";
import { getRequestIdFromHeaders } from "@/lib/logger";
import {
  checkPersistentRateLimit,
  rateLimitHeaders
} from "@/lib/rate-limit";
import { hasDatabaseUrl } from "@/lib/server-config";
import {
  analyzeAndSaveConversation,
  getCoachAnalysisOptions,
  getCoachDashboard,
  getCoachReport
} from "@/apps/team-os/features/ai-coach/services/ai-coach-repository";
import {
  parseAnalyzeConversationInput,
  parseCoachReportId,
  parseCoachTeamId
} from "@/apps/team-os/features/ai-coach/utils/ai-coach-input";
import { createTeamOsApiErrorHandler } from "@/apps/team-os/features/production/services/error-handler";
import { readTeamOsJson as readJson } from "@/apps/team-os/features/production/services/production-http";

const apiError = createTeamOsApiErrorHandler("AI");

export async function handleCoachAnalysisOptions(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) {
      return apiError(databaseConfigError("读取 AI 教练分析选项"));
    }
    return apiSuccess(await getCoachAnalysisOptions(user.id));
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCoachAnalyze(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) {
      return apiError(databaseConfigError("生成 AI 教练报告"));
    }

    const rateLimit = await checkPersistentRateLimit(request, {
      namespace: "team-os-ai-coach-analyze",
      userId: user.id,
      limit: 12,
      windowMs: 10 * 60 * 1_000,
      globalLimit: 240
    });
    if (!rateLimit.allowed) {
      return apiError(
        new RateLimitError(`AI 教练分析请求过于频繁，请 ${rateLimit.retryAfterSeconds} 秒后再试。`),
        { headers: rateLimitHeaders(rateLimit) }
      );
    }

    const input = parseAnalyzeConversationInput(await readJson(request));
    const result = await analyzeAndSaveConversation(
      user.id,
      input,
      getRequestIdFromHeaders(request.headers)
    );
    return apiSuccess(result, {
      status: result.reused ? 200 : 201,
      headers: rateLimitHeaders(rateLimit)
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCoachReportGet(request: Request, reportId: string) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) {
      return apiError(databaseConfigError("读取 AI 教练报告"));
    }
    return apiSuccess(await getCoachReport(user.id, parseCoachReportId(reportId)));
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCoachTeamGet(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) {
      return apiError(databaseConfigError("读取团队教练数据"));
    }
    const teamId = parseCoachTeamId(new URL(request.url).searchParams.get("teamId"));
    return apiSuccess(await getCoachDashboard(user.id, teamId));
  } catch (error) {
    return apiError(error);
  }
}
