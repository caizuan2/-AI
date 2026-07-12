export const TEAM_ROLES = ["TEAM_OWNER", "TEAM_MANAGER", "TRAINER", "TEAM_MEMBER"] as const;

export type TeamRole = (typeof TEAM_ROLES)[number];

export interface TeamOsUser {
  name: string;
  identity: string;
}
