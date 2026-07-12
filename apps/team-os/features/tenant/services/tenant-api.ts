import "server-only";

import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { requireUserAppAccess } from "@/lib/auth/guards";
import { RateLimitError } from "@/lib/errors";
import { checkPersistentRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { hasDatabaseUrl } from "@/lib/server-config";
import {
  assertTenantUpgradeAccess,
  resolveTenantAccess
} from "@/apps/team-os/features/tenant/services/tenant-access";
import { checkTenantFeature } from "@/apps/team-os/features/tenant/services/feature-guard";
import {
  getTenantCompanyData,
  getTenantSubscriptionData,
  getTenantUsageData,
  requestTenantSubscriptionUpgrade
} from "@/apps/team-os/features/tenant/services/tenant-repository";
import {
  parseFeatureCheckQuery,
  parseTenantCompanyQuery,
  parseUpgradeIntentInput
} from "@/apps/team-os/features/tenant/utils/tenant-input";

async function readJson(request: Request) {
  try {
    return await request.json() as unknown;
  } catch {
    return null;
  }
}

function companyQuery(request: Request) {
  return parseTenantCompanyQuery(new URL(request.url).searchParams);
}

export async function handleTenantCompanyGet(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("读取企业中心"));
    const query = companyQuery(request);
    return apiSuccess(await getTenantCompanyData(user.id, query.companyId));
  } catch (error) {
    return apiError(error);
  }
}

export async function handleTenantSubscriptionGet(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("读取企业套餐"));
    const query = companyQuery(request);
    return apiSuccess(await getTenantSubscriptionData(user.id, query.companyId));
  } catch (error) {
    return apiError(error);
  }
}

export async function handleTenantUsageGet(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("读取企业使用量"));
    const query = companyQuery(request);
    return apiSuccess(await getTenantUsageData(user.id, query.companyId));
  } catch (error) {
    return apiError(error);
  }
}

export async function handleTenantFeatureCheckGet(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("检查企业功能权限"));
    const input = parseFeatureCheckQuery(new URL(request.url).searchParams);
    return apiSuccess(await checkTenantFeature(user.id, input));
  } catch (error) {
    return apiError(error);
  }
}

export async function handleTenantSubscriptionUpgradePost(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("检查企业套餐升级授权要求"));
    const input = parseUpgradeIntentInput(await readJson(request));
    const access = await resolveTenantAccess(user.id, input.companyId);
    assertTenantUpgradeAccess(access);

    const rateLimit = await checkPersistentRateLimit(request, {
      namespace: "team-os-subscription-upgrade-intent",
      userId: user.id,
      limit: 5,
      globalLimit: 100,
      windowMs: 15 * 60 * 1_000
    });
    if (!rateLimit.allowed) {
      return apiError(
        new RateLimitError(`套餐升级授权检查过于频繁，请 ${rateLimit.retryAfterSeconds} 秒后再试。`),
        { headers: rateLimitHeaders(rateLimit) }
      );
    }

    const result = await requestTenantSubscriptionUpgrade(user.id, input);
    return apiSuccess(result, { headers: rateLimitHeaders(rateLimit) });
  } catch (error) {
    return apiError(error);
  }
}
