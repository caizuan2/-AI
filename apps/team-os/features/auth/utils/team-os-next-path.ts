import {
  getTeamOsPublicEntry,
  TEAM_OS_HOME_PATH,
  TEAM_OS_INVITE_PATH
} from "@/apps/team-os/features/auth/constants";

export function isTeamOsInvitationNextPath(candidate: string | null | undefined): candidate is string {
  if (!candidate || !candidate.startsWith(`${TEAM_OS_INVITE_PATH}/`)) {
    return false;
  }

  const pathname = candidate.split("?")[0] || candidate;
  const code = pathname.slice(TEAM_OS_INVITE_PATH.length + 1);
  return Boolean(code) && !code.includes("/");
}

export function getSafeTeamOsNextPath(candidate: string | null | undefined) {
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return TEAM_OS_HOME_PATH;
  }

  const pathname = candidate.split("?")[0] || candidate;

  if (
    (getTeamOsPublicEntry(pathname) && !isTeamOsInvitationNextPath(candidate)) ||
    (pathname !== TEAM_OS_HOME_PATH && !pathname.startsWith(`${TEAM_OS_HOME_PATH}/`))
  ) {
    return TEAM_OS_HOME_PATH;
  }

  return candidate;
}
