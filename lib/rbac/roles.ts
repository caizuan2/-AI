export const appRoles = ["user", "kb_admin", "super_admin"] as const;

export type AppRole = (typeof appRoles)[number];

const roleRank: Record<AppRole, number> = {
  user: 0,
  kb_admin: 1,
  super_admin: 2
};

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && appRoles.includes(value as AppRole);
}

export function normalizeAppRole(value: unknown): AppRole | null {
  return isAppRole(value) ? value : null;
}

export function getHighestRole(roles: AppRole[]): AppRole {
  let highest: AppRole = "user";

  for (const role of roles) {
    if (roleRank[role] > roleRank[highest]) {
      highest = role;
    }
  }

  return highest;
}

export function roleSatisfies(role: AppRole, required: AppRole) {
  return roleRank[role] >= roleRank[required];
}

export function canAccessKnowledgeManagementRole(role: AppRole) {
  return roleSatisfies(role, "kb_admin");
}

export function canAccessAdminApiRole(role: AppRole) {
  return role === "super_admin";
}

export function canSoftDeleteKnowledgeRole(role: AppRole) {
  return role === "super_admin";
}
