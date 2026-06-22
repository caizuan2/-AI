import type { SuperAdminPlatform, SyncHealth } from "@/types/super-admin-sync";

export type EnvConfigStatus = {
  databaseUrlConfigured: boolean;
  directUrlConfigured: boolean;
  saasMode: "mock" | "prisma";
  billingProvider: "license";
  platforms: SuperAdminPlatform[];
  sharedBackendRequired: true;
  sharedAccountRequired: true;
  sharedDatabaseRequired: true;
  loginRegisterDependsOnDatabase: true;
  licenseDependsOnDatabase: true;
  syncDependsOnDatabase: true;
  storageDependsOnObjectStorage: true;
  warnings: string[];
};

export type DataSourceCheck = {
  name: string;
  status: SyncHealth;
  description: string;
  requiredFor: string[];
};

export type PlatformDataSourceStatus = {
  platform: SuperAdminPlatform;
  backendConnected: boolean;
  accountSystem: "shared";
  database: "shared_required";
  dataSource: "shared_backend";
  isolatedLocalDataRisk: "none" | "warning";
  status: SyncHealth;
};

export type DataSourceHealth = EnvConfigStatus & {
  checks: DataSourceCheck[];
  platformStatuses: PlatformDataSourceStatus[];
  recentSyncAt: string;
  failedSyncCount: number;
  persistenceStatus: SyncHealth;
  isolatedLocalDataRisk: boolean;
  selfTestRecommendation: string;
};
