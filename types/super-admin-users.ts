export type SuperAdminAssignableRole = "user" | "ingest_admin" | "enterprise_admin" | "super_admin";

export type SuperAdminDbRole = SuperAdminAssignableRole | "kb_admin";

export type SuperAdminSyncedPlatform = "web" | "android_apk" | "windows_exe";

export type SuperAdminUserAccountStatus = "active" | "disabled";

export type SuperAdminUserListItem = {
  id: string;
  email: string | null;
  phone: string;
  name: string;
  role: SuperAdminDbRole;
  roleLabel: string;
  tenantId: string | null;
  tenantName: string;
  tenantPlan: string;
  licenseActivated: boolean;
  licenseStatus: "activated" | "inactive";
  lastLoginAt: string | null;
  createdAt: string;
  accountStatus: SuperAdminUserAccountStatus;
  accountStatusLabel: string;
  syncedPlatforms: SuperAdminSyncedPlatform[];
};

export type SuperAdminUsersResponse = {
  users: SuperAdminUserListItem[];
  total: number;
  roles: SuperAdminRolePolicy[];
  filters: {
    search: string;
    role: string;
    tenantId: string;
  };
};

export type SuperAdminUserDetail = SuperAdminUserListItem & {
  roleAssignments: Array<{
    id: string;
    role: SuperAdminDbRole;
    assignedByUserId: string | null;
    createdAt: string;
    revokedAt: string | null;
    expiresAt: string | null;
  }>;
};

export type SuperAdminRolePolicy = {
  role: SuperAdminAssignableRole;
  label: string;
  level: number;
  description: string;
  permissions: string[];
  platformScope: string[];
  worktreeBoundary: string;
  riskLevel: "low" | "medium" | "high";
};

export type SuperAdminRoleChangeResult = {
  userId: string;
  oldRole: SuperAdminDbRole;
  newRole: SuperAdminAssignableRole;
  syncedPlatforms: SuperAdminSyncedPlatform[];
};

export type SuperAdminUserStatusResult = {
  userId: string;
  isActive: boolean;
  accountStatus: SuperAdminUserAccountStatus;
  syncedPlatforms: SuperAdminSyncedPlatform[];
};

export type SuperAdminUserAuditItem = {
  id: string;
  operatorUserId: string | null;
  targetUserId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};

export type SuperAdminUserAuditResponse = {
  logs: SuperAdminUserAuditItem[];
};
