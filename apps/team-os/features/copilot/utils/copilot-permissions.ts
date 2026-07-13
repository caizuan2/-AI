import type { CopilotAssistantRole } from "@/apps/team-os/features/copilot/types";

export interface CopilotRoleEligibility {
  hasPersonalScope: boolean;
  hasManagerScope: boolean;
  hasOwnerScope: boolean;
}

export interface CopilotRoleTeamScopes {
  personalTeamIds: readonly string[];
  managerTeamIds: readonly string[];
  companyTeamIds: readonly string[];
}

export function availableCopilotRoles(
  input: CopilotRoleEligibility
): CopilotAssistantRole[] {
  const roles: CopilotAssistantRole[] = [];
  if (input.hasPersonalScope) roles.push("EMPLOYEE_ASSISTANT");
  if (input.hasManagerScope) roles.push("MANAGER_ASSISTANT");
  if (input.hasOwnerScope) roles.push("OWNER_ASSISTANT");
  return roles;
}

export function copilotTeamIdsForRole(
  scopes: CopilotRoleTeamScopes,
  role: CopilotAssistantRole
) {
  const teamIds = role === "EMPLOYEE_ASSISTANT"
    ? scopes.personalTeamIds
    : role === "MANAGER_ASSISTANT"
      ? scopes.managerTeamIds
      : scopes.companyTeamIds;

  return Array.from(new Set(teamIds));
}
