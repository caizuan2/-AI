import type { UserMetrics } from "@/types/super-admin";

const userMetrics: UserMetrics = {
  totalUsers: 3482,
  activeUsers: 914,
  pendingUsers: 126,
  disabledUsers: 18,
  roleBreakdown: [
    { role: "super_admin", count: 3 },
    { role: "kb_admin", count: 42 },
    { role: "user", count: 3437 }
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
