import "server-only";

import { apiSuccess, databaseConfigError } from "@/lib/api-response";
import { requireUserAppAccess } from "@/lib/auth/guards";
import { RateLimitError } from "@/lib/errors";
import { getRequestIdFromHeaders } from "@/lib/logger";
import { checkPersistentRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { hasDatabaseUrl } from "@/lib/server-config";
import { analyzeCustomerForUser } from "@/apps/team-os/features/crm/services/crm-analysis";
import {
  createCustomerFollowUp,
  createCustomerForUser,
  getCustomerDetailForUser,
  listCustomersForUser
} from "@/apps/team-os/features/crm/services/crm-repository";
import {
  parseAnalyzeCustomerInput,
  parseCreateCustomerFollowUpInput,
  parseCreateCustomerInput,
  parseCustomerId,
  parseCustomerListFilters
} from "@/apps/team-os/features/crm/utils/crm-input";
import { createTeamOsApiErrorHandler } from "@/apps/team-os/features/production/services/error-handler";
import { readTeamOsJson as readJson } from "@/apps/team-os/features/production/services/production-http";

const apiError = createTeamOsApiErrorHandler("CRM");

export async function handleCrmCustomersGet(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) {
      return apiError(databaseConfigError("读取 CRM 客户列表"));
    }
    const filters = parseCustomerListFilters(new URL(request.url).searchParams);
    return apiSuccess(await listCustomersForUser(user.id, filters));
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCrmCustomerCreate(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) {
      return apiError(databaseConfigError("创建 CRM 客户"));
    }
    const input = parseCreateCustomerInput(await readJson(request));
    return apiSuccess(await createCustomerForUser(user.id, input), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCrmCustomerDetailGet(request: Request, customerId: string) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) {
      return apiError(databaseConfigError("读取 CRM 客户详情"));
    }
    return apiSuccess(await getCustomerDetailForUser(user.id, parseCustomerId(customerId)));
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCrmFollowUpCreate(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) {
      return apiError(databaseConfigError("新增客户跟进记录"));
    }
    const input = parseCreateCustomerFollowUpInput(await readJson(request));
    return apiSuccess(
      { followUp: await createCustomerFollowUp(user.id, input) },
      { status: 201 }
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCrmAnalyze(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) {
      return apiError(databaseConfigError("生成 AI 客户画像"));
    }
    const rateLimit = await checkPersistentRateLimit(request, {
      namespace: "team-os-crm-analyze",
      userId: user.id,
      limit: 8,
      windowMs: 10 * 60 * 1_000,
      globalLimit: 160
    });
    if (!rateLimit.allowed) {
      return apiError(
        new RateLimitError(`AI 客户分析请求过于频繁，请 ${rateLimit.retryAfterSeconds} 秒后再试。`),
        { headers: rateLimitHeaders(rateLimit) }
      );
    }
    const input = parseAnalyzeCustomerInput(await readJson(request));
    const result = await analyzeCustomerForUser(
      user.id,
      input,
      getRequestIdFromHeaders(request.headers)
    );
    return apiSuccess(result, { headers: rateLimitHeaders(rateLimit) });
  } catch (error) {
    return apiError(error);
  }
}
