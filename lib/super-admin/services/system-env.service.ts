import { getSyncOverview } from "@/lib/super-admin/services/sync.service";
import type { DataSourceCheck, DataSourceHealth, EnvConfigStatus, PlatformDataSourceStatus } from "@/types/super-admin-system";
import type { SuperAdminPlatform, SyncHealth } from "@/types/super-admin-sync";

const platforms: SuperAdminPlatform[] = ["web", "android_apk", "windows_exe"];

function hasEnv(name: string) {
  return Boolean(process.env[name]?.trim());
}

function getSaasMode(): EnvConfigStatus["saasMode"] {
  return process.env.SAAS_MODE === "prisma" || process.env.SAAS_CORE_DATASOURCE === "prisma"
    ? "prisma"
    : "mock";
}

function buildWarnings(databaseUrlConfigured: boolean, directUrlConfigured: boolean) {
  const warnings: string[] = [];

  if (!databaseUrlConfigured) {
    warnings.push("DATABASE_URL 未配置，会导致登录、注册、三端同步、卡密激活和数据保存失败。");
  }

  if (!directUrlConfigured) {
    warnings.push("DIRECT_URL 未配置，Prisma validate / 直连数据库检查会失败。");
  }

  if (warnings.length === 0) {
    warnings.push("数据库连接环境变量已配置；请继续确认真实数据库和网络连通性。");
  }

  return warnings;
}

export function getEnvironmentConfigStatus(): EnvConfigStatus {
  const databaseUrlConfigured = hasEnv("DATABASE_URL");
  const directUrlConfigured = hasEnv("DIRECT_URL");

  return {
    databaseUrlConfigured,
    directUrlConfigured,
    saasMode: getSaasMode(),
    billingProvider: "license",
    platforms,
    sharedBackendRequired: true,
    sharedAccountRequired: true,
    sharedDatabaseRequired: true,
    loginRegisterDependsOnDatabase: true,
    licenseDependsOnDatabase: true,
    syncDependsOnDatabase: true,
    storageDependsOnObjectStorage: true,
    warnings: buildWarnings(databaseUrlConfigured, directUrlConfigured)
  };
}

function getDatabaseStatus(env: EnvConfigStatus): SyncHealth {
  return env.databaseUrlConfigured && env.directUrlConfigured ? "healthy" : "error";
}

function buildChecks(env: EnvConfigStatus): DataSourceCheck[] {
  const databaseStatus = getDatabaseStatus(env);

  return [
    {
      name: "统一数据库配置",
      status: databaseStatus,
      description: env.databaseUrlConfigured && env.directUrlConfigured
        ? "DATABASE_URL / DIRECT_URL 均已配置，三端可按统一数据库路径继续自测。"
        : "DATABASE_URL 或 DIRECT_URL 缺失会导致登录、注册、卡密激活、三端同步和数据保存失败。",
      requiredFor: ["登录", "注册", "卡密激活", "三端同步", "数据保存"]
    },
    {
      name: "统一账号体系",
      status: databaseStatus,
      description: "Web / Android APK / Windows EXE 必须共用同一账号体系，不允许各端独立账号。",
      requiredFor: ["Web", "Android APK", "Windows EXE"]
    },
    {
      name: "统一后端 API",
      status: "healthy",
      description: "本阶段只检查超级管理员 API 结构，未来三端都必须走同一后端入口。",
      requiredFor: ["同步控制中心", "设备会话", "平台版本"]
    },
    {
      name: "卡密授权数据源",
      status: databaseStatus,
      description: "卡密、授权、到期状态必须从统一后端和数据库读取；本阶段不修改卡密核心。",
      requiredFor: ["卡密激活", "Billing Provider", "订阅套餐"]
    },
    {
      name: "文件 / 图片 / 拍照附件同步",
      status: env.databaseUrlConfigured ? "warning" : "error",
      description: "附件同步需要统一后端、数据库记录和对象存储状态，本阶段只做状态提示。",
      requiredFor: ["图片", "文件", "拍照附件"]
    }
  ];
}

function buildPlatformStatuses(env: EnvConfigStatus): PlatformDataSourceStatus[] {
  const databaseReady = env.databaseUrlConfigured && env.directUrlConfigured;

  return platforms.map((platform) => ({
    platform,
    backendConnected: true,
    accountSystem: "shared",
    database: "shared_required",
    dataSource: "shared_backend",
    isolatedLocalDataRisk: databaseReady ? "none" : "warning",
    status: databaseReady ? "healthy" : "warning"
  }));
}

export function getDataSourceHealth(): DataSourceHealth {
  const env = getEnvironmentConfigStatus();
  const syncOverview = getSyncOverview();
  const checks = buildChecks(env);
  const databaseStatus = getDatabaseStatus(env);

  return {
    ...env,
    checks,
    platformStatuses: buildPlatformStatuses(env),
    recentSyncAt: syncOverview.summary.lastSyncAt,
    failedSyncCount: syncOverview.summary.failedSyncCount,
    persistenceStatus: databaseStatus,
    isolatedLocalDataRisk: databaseStatus !== "healthy",
    selfTestRecommendation: "单窗口自测：只打开 /super-admin，通过左侧菜单依次进入三端同步、设备会话、平台版本、环境连通性检查、系统健康状态。"
  };
}
