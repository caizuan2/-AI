import "server-only";

import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { requireUserAppAccess } from "@/lib/auth/guards";
import { hasDatabaseUrl } from "@/lib/server-config";
import {
  addOrganizationMember,
  createOrganizationTeam,
  createTeamInvitation,
  getOrganizationOverview,
  listOrganizationMembers,
  updateOrganizationTeam
} from "@/apps/team-os/features/organization/services/organization-repository";
import {
  parseAddMemberInput,
  parseCreateInvitationInput,
  parseCreateTeamInput,
  parseUpdateTeamInput
} from "@/apps/team-os/features/organization/utils/organization-input";

async function readJson(request: Request) {
  try {
    return await request.json() as unknown;
  } catch {
    return null;
  }
}

export async function handleOrganizationGet(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) {
      return apiError(databaseConfigError("读取组织信息"));
    }
    const companyId = new URL(request.url).searchParams.get("companyId")?.trim() || undefined;
    return apiSuccess(await getOrganizationOverview(user.id, companyId));
  } catch (error) {
    return apiError(error);
  }
}

export async function handleOrganizationCreate(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) {
      return apiError(databaseConfigError("创建团队"));
    }
    const input = parseCreateTeamInput(await readJson(request));
    return apiSuccess({ team: await createOrganizationTeam(user.id, input) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function handleOrganizationUpdate(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) {
      return apiError(databaseConfigError("更新团队"));
    }
    const input = parseUpdateTeamInput(await readJson(request));
    return apiSuccess({ team: await updateOrganizationTeam(user.id, input) });
  } catch (error) {
    return apiError(error);
  }
}

export async function handleMembersGet(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) {
      return apiError(databaseConfigError("读取成员列表"));
    }
    const companyId = new URL(request.url).searchParams.get("companyId")?.trim() || undefined;
    return apiSuccess(await listOrganizationMembers(user.id, companyId));
  } catch (error) {
    return apiError(error);
  }
}

export async function handleMembersCreate(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) {
      return apiError(databaseConfigError("添加成员"));
    }
    const input = parseAddMemberInput(await readJson(request));
    return apiSuccess({ member: await addOrganizationMember(user.id, input) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function handleInvitationCreate(request: Request) {
  try {
    const user = await requireUserAppAccess(request);
    if (!hasDatabaseUrl()) {
      return apiError(databaseConfigError("创建成员邀请"));
    }
    const input = parseCreateInvitationInput(await readJson(request));
    return apiSuccess({ invitation: await createTeamInvitation(user.id, input) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
