import "server-only";

import { apiSuccess, databaseConfigError } from "@/lib/api-response";
import { requireTeamOsAccess } from "@/apps/team-os/features/auth/services/team-os-access";
import { hasDatabaseUrl } from "@/lib/server-config";
import {
  createCoachRule,
  createIndustryStandard,
  listCoachRules,
  listIndustryStandards
} from "@/apps/team-os/features/industry-coach/services/industry-coach-repository";
import {
  parseCreateCoachRuleInput,
  parseCreateIndustryStandardInput,
  parseIndustryCompanyId
} from "@/apps/team-os/features/industry-coach/utils/industry-coach-input";
import { createTeamOsApiErrorHandler } from "@/apps/team-os/features/production/services/error-handler";
import { readTeamOsJson as readJson } from "@/apps/team-os/features/production/services/production-http";

const apiError = createTeamOsApiErrorHandler("INDUSTRY_COACH");

function requestedCompanyId(request: Request) {
  return parseIndustryCompanyId(new URL(request.url).searchParams.get("companyId"));
}

export async function handleIndustryStandardsGet(request: Request) {
  try {
    const user = await requireTeamOsAccess(request, "ai_coach");
    if (!hasDatabaseUrl()) {
      return apiError(databaseConfigError("读取行业标准"));
    }
    return apiSuccess(await listIndustryStandards(user.id, requestedCompanyId(request)));
  } catch (error) {
    return apiError(error);
  }
}

export async function handleIndustryStandardsCreate(request: Request) {
  try {
    const user = await requireTeamOsAccess(request, "ai_coach");
    if (!hasDatabaseUrl()) {
      return apiError(databaseConfigError("新增行业标准"));
    }
    const input = parseCreateIndustryStandardInput(await readJson(request));
    return apiSuccess({ standard: await createIndustryStandard(user.id, input) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCoachRulesGet(request: Request) {
  try {
    const user = await requireTeamOsAccess(request, "ai_coach");
    if (!hasDatabaseUrl()) {
      return apiError(databaseConfigError("读取评分规则"));
    }
    return apiSuccess(await listCoachRules(user.id, requestedCompanyId(request)));
  } catch (error) {
    return apiError(error);
  }
}

export async function handleCoachRulesCreate(request: Request) {
  try {
    const user = await requireTeamOsAccess(request, "ai_coach");
    if (!hasDatabaseUrl()) {
      return apiError(databaseConfigError("新增评分规则"));
    }
    const input = parseCreateCoachRuleInput(await readJson(request));
    return apiSuccess({ rule: await createCoachRule(user.id, input) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
