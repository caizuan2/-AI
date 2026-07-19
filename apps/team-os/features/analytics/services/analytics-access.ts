import "server-only";

import { ForbiddenError } from "@/lib/errors";
import { resolveTrainingAccess } from "@/apps/team-os/features/training/services/training-access";
import type {
  AnalyticsContext,
  AnalyticsTeamOption
} from "@/apps/team-os/features/analytics/types";

export interface AnalyticsAccessState {
  context: AnalyticsContext;
  isCompanyOwner: boolean;
  companyTeamIds: string[];
  managerTeamIds: string[];
  trainerTeamIds: string[];
  personalTeamIds: string[];
  businessTeamIds: string[];
  crmTeamIds: string[];
  trainingTeamIds: string[];
  selfOnly: boolean;
}

export async function resolveAnalyticsAccess(
  userId: string,
  requestedCompanyId?: string
): Promise<AnalyticsAccessState> {
  let base: Awaited<ReturnType<typeof resolveTrainingAccess>>;
  try {
    base = await resolveTrainingAccess(userId, requestedCompanyId);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      throw new ForbiddenError("当前账号尚未加入所选企业的有效团队，无法访问数据分析中心。");
    }
    throw error;
  }

  const teams: AnalyticsTeamOption[] = base.context.teams.map((team) => ({
    id: team.id,
    companyId: team.companyId,
    name: team.name,
    role: team.role
  }));
  const companyTeamIds = teams.map((team) => team.id);
  const managerTeamIds = base.isCompanyOwner ? companyTeamIds : base.managedTeamIds;
  const trainerTeamIds = base.isCompanyOwner
    ? companyTeamIds
    : teams.filter((team) => team.role === "TRAINER").map((team) => team.id);
  const personalTeamIds = base.directTeamIds;
  const businessTeamIds = base.isCompanyOwner ? companyTeamIds : managerTeamIds;
  const crmTeamIds = businessTeamIds;
  const trainingTeamIds = base.isCompanyOwner
    ? companyTeamIds
    : Array.from(new Set([
        ...managerTeamIds,
        ...trainerTeamIds,
        ...(managerTeamIds.length === 0 && trainerTeamIds.length === 0 ? personalTeamIds : [])
      ]));
  const hasManagerScope = base.isCompanyOwner || managerTeamIds.length > 0;
  const hasTrainerScope = !hasManagerScope && trainerTeamIds.length > 0;
  const hasTrainingScope = base.isCompanyOwner || managerTeamIds.length > 0 || trainerTeamIds.length > 0;
  const scopeMode = base.isCompanyOwner
    ? "COMPANY"
    : hasManagerScope
      ? "TEAM"
      : hasTrainerScope
        ? "TRAINING"
        : "SELF";

  return {
    context: {
      companyId: base.context.companyId,
      companyName: base.context.companyName,
      companies: base.context.companies,
      teams,
      currentRoles: base.context.currentRoles,
      scopeMode,
      permissions: {
        canViewCompanyDashboard: base.isCompanyOwner,
        canViewTeamAnalytics: hasManagerScope,
        canViewCrmAnalytics: hasManagerScope,
        canViewTrainingAnalytics: hasTrainingScope,
        canViewAiAnalytics: hasManagerScope,
        canGenerateBusinessInsight: hasManagerScope,
        canViewPersonalGrowth: true
      }
    },
    isCompanyOwner: base.isCompanyOwner,
    companyTeamIds,
    managerTeamIds,
    trainerTeamIds,
    personalTeamIds,
    businessTeamIds,
    crmTeamIds,
    trainingTeamIds,
    selfOnly: !hasManagerScope
  };
}

export function assertCrmAnalyticsAccess(access: AnalyticsAccessState) {
  if (!access.context.permissions.canViewCrmAnalytics || access.crmTeamIds.length === 0) {
    throw new ForbiddenError("当前角色无权查看企业或团队 CRM 分析数据。");
  }
}

export function assertBusinessInsightAccess(access: AnalyticsAccessState) {
  if (!access.context.permissions.canGenerateBusinessInsight || access.businessTeamIds.length === 0) {
    throw new ForbiddenError("只有企业负责人或团队主管可以生成经营分析建议。");
  }
}
