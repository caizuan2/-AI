import versionInfo from "../version.json";

const resolvedVersionInfo = versionInfo as {
  version: string;
  build: number;
  web_release_sha?: string;
  webReleaseSha?: string;
};

export const APP_VERSION = resolvedVersionInfo.version;
export const APP_BUILD = resolvedVersionInfo.build;
export const APP_WEB_RELEASE_SHA =
  process.env.NEXT_PUBLIC_WEB_RELEASE_SHA
  || process.env.NEXT_PUBLIC_RELEASE_SHA
  || process.env.NEXT_PUBLIC_GIT_SHA
  || resolvedVersionInfo.web_release_sha
  || resolvedVersionInfo.webReleaseSha
  || "";

export const USER_APP_KIND = "user";
export const ADMIN_APP_KIND = "admin";

export type AppKind = typeof USER_APP_KIND | typeof ADMIN_APP_KIND;
