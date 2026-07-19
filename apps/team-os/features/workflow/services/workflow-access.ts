import "server-only";

import { ForbiddenError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import type {
  WorkflowActionType,
  WorkflowContext,
  WorkflowEventType,
  WorkflowPermissionLevel
} from "@/apps/team-os/features/workflow/types";

export interface WorkflowAccessScope {
  userId: string;
  context: WorkflowContext;
  ownerTeamIds: string[];
  managerTeamIds: string[];
  trainerTeamIds: string[];
  memberTeamIds: string[];
  taskActionTeamIds: string[];
}

function permissionLevel(input: {
  owner: boolean;
  manager: boolean;
  trainer: boolean;
}): WorkflowPermissionLevel {
  if (input.owner) return "OWNER";
  if (input.manager) return "MANAGER";
  if (input.trainer) return "TRAINER";
  return "MEMBER";
}

export async function resolveWorkflowAccess(
  userId: string,
  requestedCompanyId?: string
): Promise<WorkflowAccessScope> {
  const [activeUser, memberships] = await Promise.all([
    prisma.user.findFirst({
      where: { id: userId, isActive: true },
      select: { id: true }
    }),
    prisma.teamMember.findMany({
      where: {
        userId,
        status: "ACTIVE",
        team: { status: "ACTIVE" }
      },
      select: {
        role: true,
        team: {
          select: { id: true, companyId: true, name: true, createdAt: true }
        }
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    })
  ]);
  if (!activeUser) {
    throw new ForbiddenError("当前账号已停用或不存在，无法访问工作流中心。");
  }
  if (memberships.length === 0) {
    throw new ForbiddenError("当前账号尚未加入有效企业团队，无法访问工作流中心。");
  }

  const companyIds = Array.from(new Set(memberships.map((item) => item.team.companyId)));
  if (requestedCompanyId && !companyIds.includes(requestedCompanyId)) {
    throw new ForbiddenError("当前账号无权访问所选企业的工作流。");
  }
  const companyId = requestedCompanyId ?? companyIds[0]!;
  const companyMemberships = memberships.filter((item) => item.team.companyId === companyId);
  const isOwner = companyMemberships.some((item) => item.role === "TEAM_OWNER");
  const managerTeamIds = companyMemberships
    .filter((item) => item.role === "TEAM_MANAGER")
    .map((item) => item.team.id);
  const trainerTeamIds = companyMemberships
    .filter((item) => item.role === "TRAINER")
    .map((item) => item.team.id);
  const memberTeamIds = companyMemberships.map((item) => item.team.id);
  const taskActionTeamIds = companyMemberships
    .filter((item) => item.role === "TEAM_OWNER" || item.role === "TEAM_MANAGER")
    .map((item) => item.team.id);
  const allCompanyTeams = isOwner
    ? await prisma.teamOrganization.findMany({
        where: { companyId, status: "ACTIVE" },
        select: { id: true, name: true, createdAt: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
      })
    : companyMemberships.map((item) => item.team);
  const directRoleByTeam = new Map(
    companyMemberships.map((item) => [item.team.id, item.role])
  );
  const ownerTeamIds = isOwner ? allCompanyTeams.map((team) => team.id) : [];
  const level = permissionLevel({
    owner: isOwner,
    manager: managerTeamIds.length > 0,
    trainer: trainerTeamIds.length > 0
  });

  const tenants = await prisma.tenant.findMany({
    where: { id: { in: companyIds } },
    select: { id: true, name: true }
  });
  const tenantNames = new Map(tenants.map((tenant) => [tenant.id, tenant.name]));
  const fallbackNames = new Map<string, string>();
  for (const membership of memberships) {
    if (!fallbackNames.has(membership.team.companyId)) {
      fallbackNames.set(membership.team.companyId, membership.team.name);
    }
  }

  return {
    userId,
    ownerTeamIds,
    managerTeamIds,
    trainerTeamIds,
    memberTeamIds,
    taskActionTeamIds,
    context: {
      companyId,
      companyName: tenantNames.get(companyId) ?? fallbackNames.get(companyId) ?? companyId,
      companies: companyIds.map((id) => ({
        id,
        name: tenantNames.get(id) ?? fallbackNames.get(id) ?? id
      })),
      teams: allCompanyTeams.map((team) => ({
        id: team.id,
        name: team.name,
        role: isOwner ? "TEAM_OWNER" : directRoleByTeam.get(team.id) ?? "TEAM_MEMBER"
      })),
      permissionLevel: level,
      manageableTeamIds: isOwner ? ownerTeamIds : managerTeamIds,
      taskActionTeamIds,
      trainingTeamIds: isOwner ? ownerTeamIds : trainerTeamIds,
      canManageCompany: isOwner,
      canCreate: level === "OWNER" || level === "MANAGER",
      canExecute: level === "OWNER" || level === "MANAGER"
    }
  };
}

export function assertCanViewWorkflow(access: WorkflowAccessScope) {
  if (access.context.permissionLevel === "MEMBER") {
    throw new ForbiddenError("普通成员只能接收自动任务和通知，不能访问工作流管理中心。");
  }
}

export function assertCanCreateWorkflow(
  access: WorkflowAccessScope,
  scopeTeamId?: string,
  actionTypes: WorkflowActionType[] = [],
  eventType?: WorkflowEventType
) {
  if (!access.context.canCreate) {
    throw new ForbiddenError("当前角色无权创建工作流。");
  }
  const needsTaskTeam = actionTypes.some((actionType) => (
    actionType === "CREATE_TASK" || actionType === "CREATE_FOLLOWUP"
  ));
  if (needsTaskTeam && !scopeTeamId) {
    throw new ForbiddenError("创建任务类动作必须绑定一个明确团队。");
  }
  if (needsTaskTeam && scopeTeamId && !access.taskActionTeamIds.includes(scopeTeamId)) {
    throw new ForbiddenError("创建任务类动作只能用于当前账号直接负责的团队。");
  }
  if (scopeTeamId && actionTypes.includes("GENERATE_REPORT")) {
    throw new ForbiddenError("经营报告动作只能用于企业级工作流，避免混合其他团队的聚合数据。");
  }
  if (access.context.permissionLevel === "MANAGER") {
    if (eventType === "BUSINESS_METRIC_ALERT") {
      throw new ForbiddenError("企业经营指标事件只能由企业负责人管理。");
    }
    if (!scopeTeamId || !access.managerTeamIds.includes(scopeTeamId)) {
      throw new ForbiddenError("主管只能创建自己直接管理团队的工作流。");
    }
    return;
  }
  if (scopeTeamId && !access.ownerTeamIds.includes(scopeTeamId)) {
    throw new ForbiddenError("所选团队不属于当前企业或已停用。");
  }
}

export function assertCanExecuteWorkflow(
  access: WorkflowAccessScope,
  workflow: {
    companyId: string;
    teamId: string | null;
    eventType: WorkflowEventType;
  }
) {
  if (workflow.companyId !== access.context.companyId || !access.context.canExecute) {
    throw new ForbiddenError("当前角色无权执行此工作流。");
  }
  if (access.context.permissionLevel === "MANAGER") {
    if (workflow.eventType === "BUSINESS_METRIC_ALERT") {
      throw new ForbiddenError("企业经营指标工作流只能由企业负责人执行。");
    }
    if (!workflow.teamId || !access.managerTeamIds.includes(workflow.teamId)) {
      throw new ForbiddenError("主管只能执行自己直接管理团队的工作流。");
    }
  }
  if (workflow.teamId && !access.context.manageableTeamIds.includes(workflow.teamId)) {
    throw new ForbiddenError("当前角色无权执行所选团队的工作流。");
  }
}

export function assertCanExecuteWorkflowActions(
  access: WorkflowAccessScope,
  input: {
    teamId?: string;
    actionTypes: WorkflowActionType[];
  }
) {
  const needsTaskTeam = input.actionTypes.some((actionType) => (
    actionType === "CREATE_TASK" || actionType === "CREATE_FOLLOWUP"
  ));
  if (
    needsTaskTeam &&
    (!input.teamId || !access.taskActionTeamIds.includes(input.teamId))
  ) {
    throw new ForbiddenError("当前账号不是事件团队的直接负责人或主管，不能执行创建任务类动作。");
  }
}
