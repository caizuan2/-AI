import versionInfo from "../version.json";

export const APP_VERSION = versionInfo.version;
export const APP_BUILD = versionInfo.build;

export const USER_APP_KIND = "user";
export const ADMIN_APP_KIND = "admin";

export type AppKind = typeof USER_APP_KIND | typeof ADMIN_APP_KIND;
