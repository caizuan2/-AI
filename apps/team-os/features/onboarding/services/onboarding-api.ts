import "server-only";

import { requireUser } from "@/lib/auth";
import {
  apiError,
  apiSuccess,
  databaseConfigError,
  sessionConfigError
} from "@/lib/api-response";
import { hasDatabaseUrl, hasSessionSecret } from "@/lib/server-config";
import { readTeamOsJson } from "@/apps/team-os/features/production/services/production-http";
import {
  parseActivateTeamOsCompanyInput,
  parseTeamOsInvitationCode,
  parseTeamOsRegisterInput
} from "@/apps/team-os/features/onboarding/utils/onboarding-input";
import { registerTeamOsAccount } from "@/apps/team-os/features/onboarding/services/registration-service";
import {
  acceptTeamOsInvitation,
  getTeamOsInvitationDetails
} from "@/apps/team-os/features/onboarding/services/invitation-repository";
import { activateTeamOsCompany } from "@/apps/team-os/features/onboarding/services/company-activation";

export async function handleTeamOsRegister(request: Request) {
  try {
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("注册 AI Team OS 账号"));
    if (!hasSessionSecret()) return apiError(sessionConfigError("注册 AI Team OS 账号"));
    const input = parseTeamOsRegisterInput(await readTeamOsJson(request));
    return apiSuccess(await registerTeamOsAccount(input, request), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function handleTeamOsCompanyActivation(request: Request) {
  try {
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("激活 AI Team OS 企业"));
    const user = await requireUser();
    const input = parseActivateTeamOsCompanyInput(await readTeamOsJson(request));
    return apiSuccess(await activateTeamOsCompany(user.id, input, request), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function handleTeamOsInvitationGet(codeValue: string) {
  try {
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("读取企业邀请"));
    const code = parseTeamOsInvitationCode(codeValue);
    return apiSuccess(await getTeamOsInvitationDetails(code));
  } catch (error) {
    return apiError(error);
  }
}

export async function handleTeamOsInvitationAccept(request: Request, codeValue: string) {
  try {
    if (!hasDatabaseUrl()) return apiError(databaseConfigError("接受企业邀请"));
    const user = await requireUser();
    const code = parseTeamOsInvitationCode(codeValue);
    return apiSuccess(await acceptTeamOsInvitation(user.id, code));
  } catch (error) {
    return apiError(error);
  }
}
