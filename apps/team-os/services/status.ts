import { getTeamOsVersionInfo } from "@/apps/team-os/features/production/version";

export const TEAM_OS_STATUS = {
  success: true,
  module: "AI Team OS",
  ...getTeamOsVersionInfo()
} as const;
