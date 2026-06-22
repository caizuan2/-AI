export const ADMIN_INGEST_APP_ID = "ingest-admin" as const;
export const ADMIN_INGEST_APP_NAME = "AI知识库投喂端";
export const ADMIN_INGEST_SYNC_TARGET = ["web", "exe", "apk"] as const;

export type AdminIngestAppId = typeof ADMIN_INGEST_APP_ID;
export type AdminIngestPlatform = typeof ADMIN_INGEST_SYNC_TARGET[number];
export type AdminIngestSyncTarget = AdminIngestPlatform;

export const ADMIN_INGEST_ENTRY_URLS: Record<AdminIngestPlatform, string> = {
  web: "/admin-ingest?app=ingest-admin&platform=web",
  exe: "http://localhost:3020/admin-ingest?app=ingest-admin&platform=exe",
  apk: "http://10.0.2.2:3020/admin-ingest?app=ingest-admin&platform=apk"
};

export const ADMIN_INGEST_DESKTOP_SESSION_PARTITION = "persist:admin-ingest";
export const ADMIN_INGEST_ANDROID_PACKAGE_ID = "com.aiknowledge.ingestadmin";
