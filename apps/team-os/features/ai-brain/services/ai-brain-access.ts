import "server-only";

import { ForbiddenError, ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import type {
  AiBrainContext,
  AiBrainPermissionLevel,
  KnowledgeCandidateSourceType
} from "@/apps/team-os/features/ai-brain/types";
import {
  canExtractKnowledgeSource,
  canGenerateKnowledgeOptimization,
  canReviewKnowledgeCandidate
} from "@/apps/team-os/features/ai-brain/validators/permission-policy";

export interface AiBrainAccessScope {
  userId: string;
  context: AiBrainContext;
  isCompanyOwner: boolean;
  allCompanyTeamIds: string[];
  managerTeamIds: string[];
  trainerTeamIds: string[];
  directTeamIds: string[];
}

function level(input: { owner: boolean; manager: boolean; trainer: boolean }): AiBrainPermissionLevel {
  if (input.owner) return "OWNER";
  if (input.manager) return "MANAGER";
  if (input.trainer) return "TRAINER";
  return "MEMBER";
}

export async function resolveAiBrainAccess(userId: string, requestedCompanyId?: string) {
  const [activeUser, memberships] = await Promise.all([
    prisma.user.findFirst({ where: { id: userId, isActive: true }, select: { id: true } }),
    prisma.teamMember.findMany({
      where: { userId, status: "ACTIVE", team: { status: "ACTIVE" } },
      select: {
        role: true,
        team: { select: { id: true, companyId: true, name: true, createdAt: true } }
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    })
  ]);
  if (!activeUser || memberships.length === 0) {
    throw new ForbiddenError("当前账号尚未加入有效企业团队，无法访问企业 AI Brain。");
  }
  if (requestedCompanyId !== undefined && !requestedCompanyId.trim()) {
    throw new ValidationError("企业 ID 不能为空。");
  }
  const companyIds = Array.from(new Set(memberships.map((item) => item.team.companyId)));
  if (requestedCompanyId && !companyIds.includes(requestedCompanyId)) {
    throw new ForbiddenError("当前账号无权访问所选企业的 AI Brain。");
  }
  const companyId = requestedCompanyId ?? companyIds[0]!;
  const companyMemberships = memberships.filter((item) => item.team.companyId === companyId);
  const isCompanyOwner = companyMemberships.some((item) => item.role === "TEAM_OWNER");
  const managerTeamIds = companyMemberships
    .filter((item) => item.role === "TEAM_MANAGER")
    .map((item) => item.team.id);
  const trainerTeamIds = companyMemberships
    .filter((item) => item.role === "TRAINER")
    .map((item) => item.team.id);
  const directTeamIds = companyMemberships.map((item) => item.team.id);
  const allTeams = isCompanyOwner
    ? await prisma.teamOrganization.findMany({
        where: { companyId, status: "ACTIVE" },
        select: { id: true, name: true, createdAt: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
      })
    : companyMemberships.map((item) => item.team);
  const allCompanyTeamIds = allTeams.map((team) => team.id);
  const directRoles = new Map(companyMemberships.map((item) => [item.team.id, item.role]));
  const permissionLevel = level({
    owner: isCompanyOwner,
    manager: managerTeamIds.length > 0,
    trainer: trainerTeamIds.length > 0
  });
  const visibleTeamIds = isCompanyOwner
    ? allCompanyTeamIds
    : Array.from(new Set([...managerTeamIds, ...trainerTeamIds]));
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
  const extractSourceTypes: KnowledgeCandidateSourceType[] = isCompanyOwner || managerTeamIds.length > 0
    ? ["CHAT", "CRM", "AI_COACH", "TRAINING", "WORKFLOW"]
    : trainerTeamIds.length > 0
      ? ["TRAINING"]
      : [];

  return {
    userId,
    isCompanyOwner,
    allCompanyTeamIds,
    managerTeamIds,
    trainerTeamIds,
    directTeamIds,
    context: {
      companyId,
      companyName: tenantNames.get(companyId) ?? fallbackNames.get(companyId) ?? companyId,
      companies: companyIds.map((id) => ({
        id,
        name: tenantNames.get(id) ?? fallbackNames.get(id) ?? id
      })),
      teams: allTeams.map((team) => ({
        id: team.id,
        name: team.name,
        role: isCompanyOwner ? "TEAM_OWNER" : directRoles.get(team.id) ?? "TEAM_MEMBER"
      })),
      permissionLevel,
      visibleTeamIds,
      feedbackTeamIds: isCompanyOwner ? allCompanyTeamIds : directTeamIds,
      canViewAnalysis: permissionLevel !== "MEMBER",
      canExtract: extractSourceTypes.length > 0,
      canOptimize: isCompanyOwner,
      canReview: isCompanyOwner,
      canSubmitFeedback: true,
      extractSourceTypes
    }
  } satisfies AiBrainAccessScope;
}

export function assertCanViewAiBrainAnalysis(access: AiBrainAccessScope) {
  if (!access.context.canViewAnalysis) {
    throw new ForbiddenError("普通成员只能提交知识反馈，不能查看企业知识分析。");
  }
}

export function assertCanListAiBrainFeedback(access: AiBrainAccessScope) {
  assertCanViewAiBrainAnalysis(access);
}

export function assertCanOptimizeAiBrain(access: AiBrainAccessScope) {
  if (!canGenerateKnowledgeOptimization(access)) {
    throw new ForbiddenError("当前角色无权生成企业知识优化建议。");
  }
}

export function assertCanReviewAiBrain(access: AiBrainAccessScope) {
  if (!canReviewKnowledgeCandidate(access)) {
    throw new ForbiddenError("只有企业负责人可以审核并发布候选知识。");
  }
}

export function assertFeedbackTeam(access: AiBrainAccessScope, teamId?: string) {
  if (!teamId) {
    if (!access.isCompanyOwner) {
      throw new ValidationError("请选择反馈所属团队。");
    }
    return;
  }
  if (!access.context.feedbackTeamIds.includes(teamId)) {
    throw new ForbiddenError("当前账号无权向所选团队提交反馈。");
  }
}

export function assertCanExtractSource(
  access: AiBrainAccessScope,
  sourceType: KnowledgeCandidateSourceType,
  resolvedTeamId?: string
) {
  if (!access.context.extractSourceTypes.includes(sourceType)) {
    throw new ForbiddenError("当前角色无权从此业务来源提取知识。");
  }
  if (canExtractKnowledgeSource(access, sourceType, resolvedTeamId)) return;
  throw new ForbiddenError("业务来源不属于当前账号可管理的团队范围。");
}
