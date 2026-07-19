import type { TeamMemberStatus, TeamOrganizationStatus, TeamRole } from "@/apps/team-os/features/organization/types";

export const roleLabels: Record<TeamRole, string> = {
  TEAM_OWNER: "企业负责人",
  TEAM_MANAGER: "主管",
  TRAINER: "培训师",
  TEAM_MEMBER: "员工"
};

export const organizationStatusLabels: Record<TeamOrganizationStatus, string> = {
  ACTIVE: "启用",
  DISABLED: "停用"
};

export const memberStatusLabels: Record<TeamMemberStatus, string> = {
  ACTIVE: "在职",
  INACTIVE: "停用"
};
