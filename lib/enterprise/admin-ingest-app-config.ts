export const ADMIN_INGEST_APP_ID = "ingest-admin" as const;
export const ADMIN_INGEST_APP_NAME = "AI知识库投喂端";
export const ADMIN_INGEST_PLATFORMS = ["web", "exe", "apk", "ios", "macos"] as const;
export const ADMIN_INGEST_SYNC_TARGET = ["web", "exe", "apk"] as const;

export type AdminIngestAppId = typeof ADMIN_INGEST_APP_ID;
export type AdminIngestPlatform = typeof ADMIN_INGEST_PLATFORMS[number];
export type AdminIngestSyncTarget = typeof ADMIN_INGEST_SYNC_TARGET[number];

export const ADMIN_INGEST_ENTRY_URLS: Record<AdminIngestPlatform, string> = {
  web: "/admin-ingest?app=ingest-admin&platform=web",
  exe: "http://localhost:3020/admin-ingest?app=ingest-admin&platform=exe",
  apk: "http://10.0.2.2:3020/admin-ingest?app=ingest-admin&platform=apk",
  ios: "/admin-ingest?app=ingest-admin&platform=ios",
  macos: "/admin-ingest?app=ingest-admin&platform=macos"
};

export const ADMIN_INGEST_DESKTOP_SESSION_PARTITION = "persist:admin-ingest";
export const ADMIN_INGEST_ANDROID_PACKAGE_ID = "com.aiknowledge.ingestadmin";
export const ADMIN_INGEST_IOS_BUNDLE_ID = "com.aiknowledge.ingestadmin";
export const ADMIN_INGEST_MACOS_BUNDLE_ID = "com.aiknowledge.ingestadmin.desktop";
