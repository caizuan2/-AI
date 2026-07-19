import type { TeamRole } from "@/apps/team-os/types";
import type { OrganizationPermissions } from "@/apps/team-os/features/organization/types";

export function getOrganizationPermissions(role: TeamRole | null): OrganizationPermissions {
  return {
    canCreateTeam: role === "TEAM_OWNER",
    canManageOrganization: role === "TEAM_OWNER",
    canManageTeam: role === "TEAM_OWNER" || role === "TEAM_MANAGER",
    canManageMembers: role === "TEAM_OWNER",
    canViewMembers: role === "TEAM_OWNER" || role === "TEAM_MANAGER",
    canViewTraining: role === "TEAM_OWNER" || role === "TEAM_MANAGER" || role === "TRAINER",
    canViewSelf: role !== null
  };
}
