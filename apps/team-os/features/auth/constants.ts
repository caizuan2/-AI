export const TEAM_OS_HOME_PATH = "/team-os";
export const TEAM_OS_LOGIN_PATH = "/team-os/login";
export const TEAM_OS_PUBLIC_ENTRY_HEADER = "x-ai-team-os-public-entry";
export const TEAM_OS_PUBLIC_ENTRY_LOGIN = "login";

export function isTeamOsPath(pathname: string) {
  return pathname === TEAM_OS_HOME_PATH || pathname.startsWith(`${TEAM_OS_HOME_PATH}/`);
}
