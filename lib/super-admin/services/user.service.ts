import type { UserMetrics } from "@/types/super-admin";

const userMetrics: UserMetrics = {
  totalUsers: 3482,
  activeUsers: 914,
  pendingUsers: 126,
  disabledUsers: 18,
  roleBreakdown: [
    { role: "super_admin", count: 3 },
    { role: "enterprise_admin", count: 12 },
    { role: "ingest_admin", count: 42 },
    { role: "user", count: 3425 }
  ]
};

export function getUserMetrics(): UserMetrics {
  return userMetrics;
}

export function getActiveUserCount() {
  return userMetrics.activeUsers;
}

export function getTotalUserCount() {
  return userMetrics.totalUsers;
}
