import {
  TEAM_OS_HOME_PATH,
  TEAM_OS_LOGIN_PATH
} from "@/apps/team-os/features/auth/constants";

export function getSafeTeamOsNextPath(candidate: string | null | undefined) {
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return TEAM_OS_HOME_PATH;
  }

  const pathname = candidate.split("?")[0] || candidate;

  if (
    pathname === TEAM_OS_LOGIN_PATH ||
    pathname.startsWith(`${TEAM_OS_LOGIN_PATH}/`) ||
    (pathname !== TEAM_OS_HOME_PATH && !pathname.startsWith(`${TEAM_OS_HOME_PATH}/`))
  ) {
    return TEAM_OS_HOME_PATH;
  }

  return candidate;
}
