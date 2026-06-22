export type SuperAdminPlatform = "web" | "android_apk" | "windows_exe";

export type SuperAdminAppType = "super_admin";

export type PlatformOnlineStatus = "online" | "degraded" | "offline";

export type SyncHealth = "healthy" | "warning" | "error";

export type SyncCellStatus = "synced" | "pending" | "error" | "not_configured";

export type DeviceSessionStatus = "active" | "idle" | "revoked";

export type DeviceRiskLevel = "low" | "medium" | "high";

export type ReleaseStatus = "stable" | "beta" | "pending" | "deprecated";

export type UpdateStatus = "latest" | "available" | "required" | "pending";

export type DataScope =
  | "account_status"
  | "admin_actions"
  | "chat_history"
  | "system_config"
  | "license_status"
  | "tenant_rbac"
  | "commercial_usage"
  | "download_versions"
  | "attachments"
  | "audit_logs";

export type PlatformSyncStatus = {
  platform: SuperAdminPlatform;
  appType: SuperAdminAppType;
  version: string;
  onlineStatus: PlatformOnlineStatus;
  lastSyncAt: string;
  syncHealth: SyncHealth;
  pendingSyncCount: number;
  failedSyncCount: number;
  latencyMs: number;
  conflictCount: number;
  dataScopes: DataScope[];
  downloadUrl: string;
  forceUpdate: boolean;
  updateStatus: UpdateStatus;
};

export type SyncMatrixRow = {
  scope: DataScope;
  label: string;
  web: SyncCellStatus;
  android_apk: SyncCellStatus;
  windows_exe: SyncCellStatus;
};

export type SyncEvent = {
  id: string;
  time: string;
  platform: SuperAdminPlatform;
  account: string;
  action: string;
  scope: DataScope;
  result: SyncCellStatus;
  durationMs: number;
};

export type DeviceSession = {
  deviceId: string;
  account: string;
  platform: SuperAdminPlatform;
  appVersion: string;
  deviceName: string;
  ip: string;
  location: string;
  lastActiveAt: string;
  loginAt: string;
  sessionStatus: DeviceSessionStatus;
  riskLevel: DeviceRiskLevel;
  syncStatus: SyncCellStatus;
};

export type DeviceRisk = {
  id: string;
  deviceId: string;
  account: string;
  riskLevel: DeviceRiskLevel;
  reason: string;
  detectedAt: string;
  status: "open" | "monitoring" | "resolved";
};

export type PlatformVersion = {
  appName: string;
  appType: SuperAdminAppType;
  platform: SuperAdminPlatform;
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string;
  forceUpdate: boolean;
  releasedAt: string;
  releaseStatus: ReleaseStatus;
  syncCapability: string;
  dataSourceStatus: "shared_backend" | "pending_config";
};

export type PlatformDownload = {
  platform: SuperAdminPlatform;
  appName: string;
  version: string;
  downloadUrl: string;
  updateStatus: UpdateStatus;
  forceUpdate: boolean;
};

export type SyncOverview = {
  platforms: PlatformSyncStatus[];
  matrix: SyncMatrixRow[];
  summary: {
    onlineDeviceCount: number;
    lastSyncAt: string;
    pendingSyncCount: number;
    failedSyncCount: number;
    consistencyStatus: SyncHealth;
    averageLatencyMs: number;
    conflictCount: number;
    syncHealth: SyncHealth;
  };
};
