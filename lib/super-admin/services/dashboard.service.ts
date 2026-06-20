import {
  superAdminMenus,
  superAdminStats
} from "@/lib/enterprise/mock-data";
import type { DashboardStats, SuperAdminMenuItem, SuperAdminOverview } from "@/types/super-admin";
import { getRecentLogs } from "@/lib/super-admin/services/audit.service";
import { getDownloadPackages } from "@/lib/super-admin/services/download.service";
import { getLicenseSummary } from "@/lib/super-admin/services/license.service";
import { getSystemHealth } from "@/lib/super-admin/services/system.service";
import { getUserMetrics } from "@/lib/super-admin/services/user.service";
import { getQuickActions } from "@/lib/super-admin/services/analytics.service";

export function getDashboardStats(): DashboardStats[] {
  return superAdminStats;
}

export function getSuperAdminMenus(): SuperAdminMenuItem[] {
  return superAdminMenus;
}

export function getSuperAdminOverview(): SuperAdminOverview {
  return {
    stats: getDashboardStats(),
    users: getUserMetrics(),
    licenses: getLicenseSummary(),
    systemHealth: getSystemHealth(),
    downloads: getDownloadPackages(),
    auditLogs: getRecentLogs(),
    quickActions: getQuickActions()
  };
}
