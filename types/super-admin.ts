export type SuperAdminStatus = "normal" | "warning" | "critical" | "pending";

export type HealthStatus = "healthy" | "warning" | "error";

export type SuperAdminTone = "emerald" | "amber" | "rose" | "sky" | "slate";

export type SuperAdminMenuItem = {
  title: string;
  href: string;
  description: string;
  icon: string;
  badge?: string;
};

export type DashboardStats = {
  title: string;
  value: string;
  unit?: string;
  status: SuperAdminStatus;
  trend: string;
  description: string;
  icon: string;
  tone: SuperAdminTone;
};

export type UserMetrics = {
  totalUsers: number;
  activeUsers: number;
  pendingUsers: number;
  disabledUsers: number;
  roleBreakdown: Array<{
    role: string;
    count: number;
  }>;
};

export type LicenseInfo = {
  activated: number;
  expiringSoon: number;
  pendingPolicies: number;
  utilizationRate: string;
};

export type DownloadPlatform = "Web" | "Android APK" | "Windows EXE";

export type DownloadStatus = "正常" | "待发布" | "测试中" | "需更新";

export type DownloadPackage = {
  id: string;
  group: "用户端" | "投喂管理员端" | "超级管理员端";
  appName: string;
  appType: string;
  platform: DownloadPlatform;
  currentVersion: string;
  latestVersion: string;
  version: string;
  downloadUrl: string;
  changelog: string;
  releaseNotes: string;
  forceUpdate: boolean;
  releasedAt: string;
  status: DownloadStatus;
};

export type AuditLog = {
  id: string;
  category: string;
  title: string;
  actor: string;
  user: string;
  action: string;
  time: string;
  ip: string;
  status: SuperAdminStatus;
  description: string;
};

export type SystemHealth = {
  name: string;
  status: SuperAdminStatus;
  health: HealthStatus;
  availability: string;
  latency: string;
  description: string;
  checkedAt: string;
};

export type QuickAction = {
  title: string;
  description: string;
  href: string;
  icon: string;
  status: SuperAdminStatus;
};

export type SuperAdminOverview = {
  stats: DashboardStats[];
  users: UserMetrics;
  licenses: LicenseInfo;
  systemHealth: SystemHealth[];
  downloads: DownloadPackage[];
  auditLogs: AuditLog[];
  quickActions: QuickAction[];
};

export type SuperAdminApiResponse<T> = {
  success: true;
  data: T;
  timestamp: number;
};
