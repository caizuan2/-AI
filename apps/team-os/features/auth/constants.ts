export const TEAM_OS_HOME_PATH = "/team-os";
export const TEAM_OS_LOGIN_PATH = "/team-os/login";
export const TEAM_OS_REGISTER_PATH = "/team-os/register";
export const TEAM_OS_ACTIVATE_PATH = "/team-os/activate";
export const TEAM_OS_INVITE_PATH = "/team-os/invite";
export const TEAM_OS_PLATFORM_LICENSES_PATH = "/team-os/platform/licenses";
export const TEAM_OS_PUBLIC_ENTRY_HEADER = "x-ai-team-os-public-entry";

export const TEAM_OS_PUBLIC_ENTRIES = {
  login: "login",
  register: "register",
  activate: "activate",
  invite: "invite",
  platformLicenses: "platform-licenses"
} as const;

export type TeamOsPublicEntry = (typeof TEAM_OS_PUBLIC_ENTRIES)[keyof typeof TEAM_OS_PUBLIC_ENTRIES];

const TEAM_OS_PUBLIC_ENTRY_VALUES = new Set<TeamOsPublicEntry>(Object.values(TEAM_OS_PUBLIC_ENTRIES));

export function getTeamOsPublicEntry(pathname: string): TeamOsPublicEntry | null {
  if (pathname === TEAM_OS_LOGIN_PATH) {
    return TEAM_OS_PUBLIC_ENTRIES.login;
  }

  if (pathname === TEAM_OS_REGISTER_PATH) {
    return TEAM_OS_PUBLIC_ENTRIES.register;
  }

  if (pathname === TEAM_OS_ACTIVATE_PATH) {
    return TEAM_OS_PUBLIC_ENTRIES.activate;
  }

  if (
    pathname === TEAM_OS_INVITE_PATH ||
    (
      pathname.startsWith(`${TEAM_OS_INVITE_PATH}/`) &&
      Boolean(pathname.slice(TEAM_OS_INVITE_PATH.length + 1)) &&
      pathname.slice(TEAM_OS_INVITE_PATH.length + 1).split("/").length === 1
    )
  ) {
    return TEAM_OS_PUBLIC_ENTRIES.invite;
  }

  if (pathname === TEAM_OS_PLATFORM_LICENSES_PATH) {
    return TEAM_OS_PUBLIC_ENTRIES.platformLicenses;
  }

  return null;
}

export function isTeamOsPublicEntry(value: string | null | undefined): value is TeamOsPublicEntry {
  return Boolean(value) && TEAM_OS_PUBLIC_ENTRY_VALUES.has(value as TeamOsPublicEntry);
}

export function isTeamOsPath(pathname: string) {
  return pathname === TEAM_OS_HOME_PATH || pathname.startsWith(`${TEAM_OS_HOME_PATH}/`);
}
