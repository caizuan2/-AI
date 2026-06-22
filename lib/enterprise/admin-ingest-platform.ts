import {
  ADMIN_INGEST_APP_ID,
  ADMIN_INGEST_SYNC_TARGET,
  type AdminIngestAppId,
  type AdminIngestPlatform,
  type AdminIngestSyncTarget
} from "@/lib/enterprise/admin-ingest-app-config";

export type {
  AdminIngestPlatform,
  AdminIngestSyncTarget
} from "@/lib/enterprise/admin-ingest-app-config";

export interface AdminIngestPlatformContext {
  platform: AdminIngestPlatform;
  app: AdminIngestAppId;
  syncTarget: AdminIngestSyncTarget[];
}

export const defaultAdminIngestPlatformContext: AdminIngestPlatformContext = {
  platform: "web",
  app: ADMIN_INGEST_APP_ID,
  syncTarget: [...ADMIN_INGEST_SYNC_TARGET]
};

export function normalizeAdminIngestPlatform(value?: string | null): AdminIngestPlatform | null {
  if (value === "web" || value === "exe" || value === "apk") {
    return value;
  }

  return null;
}

export function getAdminIngestPlatformLabel(platform: AdminIngestPlatform) {
  const labels: Record<AdminIngestPlatform, string> = {
    web: "Web",
    exe: "EXE",
    apk: "APK"
  };

  return labels[platform];
}

export function resolveAdminIngestPlatformContext(options: {
  search?: string;
  userAgent?: string;
} = {}): AdminIngestPlatformContext {
  const search = options.search?.startsWith("?") ? options.search.slice(1) : options.search ?? "";
  const params = new URLSearchParams(search);
  const queryPlatform = normalizeAdminIngestPlatform(params.get("platform"));

  if (queryPlatform) {
    return {
      ...defaultAdminIngestPlatformContext,
      platform: queryPlatform
    };
  }

  const userAgent = options.userAgent?.toLowerCase() ?? "";

  if (userAgent.includes("electron") || userAgent.includes("admin-ingest-exe")) {
    return {
      ...defaultAdminIngestPlatformContext,
      platform: "exe"
    };
  }

  if (userAgent.includes("android") || userAgent.includes("capacitor")) {
    return {
      ...defaultAdminIngestPlatformContext,
      platform: "apk"
    };
  }

  return defaultAdminIngestPlatformContext;
}
