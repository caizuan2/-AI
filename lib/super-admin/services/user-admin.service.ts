import "server-only";

import type { Prisma, UserRole } from "@prisma/client";
import { getAuditRequestContext } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import type { RbacUser } from "@/lib/auth/rbac";
import {
  getRoleLabel,
  getRolePolicyMatrix,
  isAssignableUserRole,
  syncedRolePlatforms
} from "@/lib/super-admin/services/role-policy.service";
import type {
  SuperAdminAssignableRole,
  SuperAdminDbRole,
  SuperAdminRoleChangeResult,
  SuperAdminUserAccountStatus,
  SuperAdminUserAuditResponse,
  SuperAdminUserDetail,
  SuperAdminUserListItem,
  SuperAdminUsersResponse,
  SuperAdminUserStatusResult
} from "@/types/super-admin-users";

const userAuditActions = [
  "update_user_role",
  "promote_to_super_admin",
  "promote_to_ingest_admin",
  "promote_to_enterprise_admin",
  "demote_user_role",
  "disable_user",
  "enable_user",
  "last_super_admin_protected"
];

const dbRoleRank: Record<SuperAdminDbRole, number> = {
  user: 0,
  kb_admin: 1,
  ingest_admin: 1,
  enterprise_admin: 2,
  super_admin: 3
};

export class UserAdminOperationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400
  ) {
    super(message);
    this.name = "UserAdminOperationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toIsoString(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeDbRole(role: unknown): SuperAdminDbRole {
  if (
    role === "user" ||
    role === "kb_admin" ||
    role === "ingest_admin" ||
    role === "enterprise_admin" ||
    role === "super_admin"
  ) {
    return role;
  }

  return "user";
}

function getEffectiveRole(baseRole: unknown, assignments: Array<{ role: UserRole }> = []): SuperAdminDbRole {
  let effectiveRole = normalizeDbRole(baseRole);

  for (const assignment of assignments) {
    const assignedRole = normalizeDbRole(assignment.role);

    if (dbRoleRank[assignedRole] > dbRoleRank[effectiveRole]) {
      effectiveRole = assignedRole;
    }
  }

  return effectiveRole;
}

function accountStatus(isActive: boolean): SuperAdminUserAccountStatus {
  return isActive ? "active" : "disabled";
}

function serializeUser(user: {
  id: string;
  email: string | null;
  phone: string;
  name: string | null;
  role: UserRole;
  tenantId: string | null;
  licenseActivated: boolean;
  isActive: boolean;
  createdAt: Date;
  tenant?: {
    name: string;
    plan: string;
  } | null;
  sessions?: Array<{
    createdAt: Date;
  }>;
  roleAssignments?: Array<{
    role: UserRole;
  }>;
}): SuperAdminUserListItem {
  const role = getEffectiveRole(user.role, user.roleAssignments);
  const status = accountStatus(user.isActive);

  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    name: user.name?.trim() || user.phone || user.email || user.id,
    role,
    roleLabel: getRoleLabel(role),
    tenantId: user.tenantId,
    tenantName: user.tenant?.name ?? "未分配企业",
    tenantPlan: user.tenant?.plan ?? "未配置",
    licenseActivated: user.licenseActivated,
    licenseStatus: user.licenseActivated ? "activated" : "inactive",
    lastLoginAt: toIsoString(user.sessions?.[0]?.createdAt ?? null),
    createdAt: user.createdAt.toISOString(),
    accountStatus: status,
    accountStatusLabel: status === "active" ? "正常" : "已禁用",
    syncedPlatforms: [...syncedRolePlatforms]
  };
}

function buildUserWhere(searchParams: URLSearchParams): Prisma.UserWhereInput {
  const search = searchParams.get("search")?.trim() ?? "";
  const role = searchParams.get("role")?.trim() ?? "";
  const tenantId = searchParams.get("tenantId")?.trim() ?? "";
  const where: Prisma.UserWhereInput = {};

  if (search) {
    where.OR = [
      { id: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } }
    ];
  }

  if (role && (isAssignableUserRole(role) || role === "kb_admin")) {
    where.role = role as UserRole;
  }

  if (tenantId) {
    where.tenantId = tenantId;
  }

  return where;
}

export async function listSuperAdminUsers(searchParams: URLSearchParams): Promise<SuperAdminUsersResponse> {
  const where = buildUserWhere(searchParams);
  const now = new Date();
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: {
        createdAt: "desc"
      },
      take: 100,
      include: {
        tenant: {
          select: {
            name: true,
            plan: true
          }
        },
        sessions: {
          orderBy: {
            createdAt: "desc"
          },
          take: 1,
          select: {
            createdAt: true
          }
        },
        roleAssignments: {
          where: {
            revokedAt: null,
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: now } }
            ]
          },
          select: {
            role: true
          }
        }
      }
    }),
    prisma.user.count({ where })
  ]);

  return {
    users: users.map(serializeUser),
    total,
    roles: getRolePolicyMatrix(),
    filters: {
      search: searchParams.get("search")?.trim() ?? "",
      role: searchParams.get("role")?.trim() ?? "",
      tenantId: searchParams.get("tenantId")?.trim() ?? ""
    }
  };
}

export async function getSuperAdminUserDetail(userId: string): Promise<SuperAdminUserDetail> {
  const user = await prisma.user.findUnique({
    where: {
      id: userId
    },
    include: {
      tenant: {
        select: {
          name: true,
          plan: true
        }
      },
      sessions: {
        orderBy: {
          createdAt: "desc"
        },
        take: 1,
        select: {
          createdAt: true
        }
      },
      roleAssignments: {
        orderBy: {
          createdAt: "desc"
        },
        take: 20,
        select: {
          id: true,
          role: true,
          assignedByUserId: true,
          createdAt: true,
          revokedAt: true,
          expiresAt: true
        }
      }
    }
  });

  if (!user) {
    throw new UserAdminOperationError("USER_NOT_FOUND", "用户不存在。", 404);
  }

  const now = new Date();
  const activeRoleAssignments = user.roleAssignments.filter((assignment) => (
    !assignment.revokedAt && (!assignment.expiresAt || assignment.expiresAt > now)
  ));

  return {
    ...serializeUser({
      ...user,
      roleAssignments: activeRoleAssignments
    }),
    roleAssignments: user.roleAssignments.map((assignment) => ({
      id: assignment.id,
      role: normalizeDbRole(assignment.role),
      assignedByUserId: assignment.assignedByUserId,
      createdAt: assignment.createdAt.toISOString(),
      revokedAt: toIsoString(assignment.revokedAt),
      expiresAt: toIsoString(assignment.expiresAt)
    }))
  };
}

async function countSuperAdminUsers() {
  const now = new Date();
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { role: "super_admin" },
        {
          roleAssignments: {
            some: {
              role: "super_admin",
              revokedAt: null,
              OR: [
                { expiresAt: null },
                { expiresAt: { gt: now } }
              ]
            }
          }
        }
      ]
    },
    select: {
      id: true
    }
  });

  return new Set(users.map((user) => user.id)).size;
}

function getRoleChangeAuditAction(oldRole: SuperAdminDbRole, newRole: SuperAdminAssignableRole) {
  if (newRole === "super_admin") {
    return "promote_to_super_admin";
  }

  if (newRole === "ingest_admin") {
    return "promote_to_ingest_admin";
  }

  if (newRole === "enterprise_admin") {
    return "promote_to_enterprise_admin";
  }

  if (oldRole === "super_admin") {
    return "demote_user_role";
  }

  return "update_user_role";
}

async function writeUserAdminAudit(input: {
  actor: Pick<RbacUser, "id" | "role">;
  targetUserId: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  request?: Request;
}) {
  const requestContext = getAuditRequestContext(input.request);

  await prisma.auditLog.create({
    data: {
      userId: input.actor.id,
      role: input.actor.role,
      action: input.action,
      targetType: "user",
      targetId: input.targetUserId,
      ip: requestContext.ip,
      userAgent: requestContext.userAgent,
      metadata: {
        operatorUserId: input.actor.id,
        targetUserId: input.targetUserId,
        action: input.action,
        resourceType: "user",
        resourceId: input.targetUserId,
        before: input.before,
        after: input.after,
        syncedPlatforms: syncedRolePlatforms
      } as Prisma.InputJsonObject
    }
  });
}

export async function updateSuperAdminUserRole(input: {
  actor: Pick<RbacUser, "id" | "role">;
  targetUserId: string;
  role: unknown;
  reason?: string;
  request?: Request;
}): Promise<SuperAdminRoleChangeResult> {
  if (!isAssignableUserRole(input.role)) {
    throw new UserAdminOperationError("INVALID_USER_ROLE", "目标角色不受支持。", 400);
  }

  const target = await prisma.user.findUnique({
    where: {
      id: input.targetUserId
    },
    select: {
      id: true,
      role: true,
      roleAssignments: {
        where: {
          revokedAt: null,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        },
        select: {
          role: true
        }
      }
    }
  });

  if (!target) {
    throw new UserAdminOperationError("USER_NOT_FOUND", "用户不存在。", 404);
  }

  const oldRole = getEffectiveRole(target.role, target.roleAssignments);
  const newRole = input.role;

  if (oldRole === "super_admin" && newRole !== "super_admin" && await countSuperAdminUsers() <= 1) {
    await writeUserAdminAudit({
      actor: input.actor,
      targetUserId: input.targetUserId,
      action: "last_super_admin_protected",
      before: {
        role: oldRole,
        reason: input.reason ?? null
      },
      after: null,
      request: input.request
    });

    throw new UserAdminOperationError(
      "LAST_SUPER_ADMIN_PROTECTED",
      "不能降级系统最后一个超级管理员。",
      403
    );
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: {
        id: input.targetUserId
      },
      data: {
        role: newRole as UserRole
      }
    });

    await tx.userRoleAssignment.updateMany({
      where: {
        userId: input.targetUserId,
        revokedAt: null
      },
      data: {
        revokedAt: now
      }
    });

    if (newRole !== "user") {
      await tx.userRoleAssignment.create({
        data: {
          userId: input.targetUserId,
          role: newRole as UserRole,
          assignedByUserId: input.actor.id
        }
      });
    }

    const requestContext = getAuditRequestContext(input.request);
    const action = getRoleChangeAuditAction(oldRole, newRole);

    await tx.auditLog.create({
      data: {
        userId: input.actor.id,
        role: input.actor.role,
        action,
        targetType: "user",
        targetId: input.targetUserId,
        ip: requestContext.ip,
        userAgent: requestContext.userAgent,
        metadata: {
          operatorUserId: input.actor.id,
          targetUserId: input.targetUserId,
          action,
          resourceType: "user",
          resourceId: input.targetUserId,
          before: {
            role: oldRole
          },
          after: {
            role: newRole,
            reason: input.reason ?? null
          },
          syncedPlatforms: syncedRolePlatforms
        } as Prisma.InputJsonObject
      }
    });
  });

  return {
    userId: input.targetUserId,
    oldRole,
    newRole,
    syncedPlatforms: [...syncedRolePlatforms]
  };
}

export async function updateSuperAdminUserStatus(input: {
  actor: Pick<RbacUser, "id" | "role">;
  targetUserId: string;
  isActive: unknown;
  reason?: string;
  request?: Request;
}): Promise<SuperAdminUserStatusResult> {
  if (typeof input.isActive !== "boolean") {
    throw new UserAdminOperationError("INVALID_USER_STATUS", "isActive 必须是布尔值。", 400);
  }

  const target = await prisma.user.findUnique({
    where: {
      id: input.targetUserId
    },
    select: {
      id: true,
      role: true,
      isActive: true,
      roleAssignments: {
        where: {
          revokedAt: null,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        },
        select: {
          role: true
        }
      }
    }
  });

  if (!target) {
    throw new UserAdminOperationError("USER_NOT_FOUND", "用户不存在。", 404);
  }

  const role = getEffectiveRole(target.role, target.roleAssignments);

  if (!input.isActive && target.isActive && role === "super_admin" && await countSuperAdminUsers() <= 1) {
    await writeUserAdminAudit({
      actor: input.actor,
      targetUserId: input.targetUserId,
      action: "last_super_admin_protected",
      before: {
        isActive: target.isActive,
        role,
        reason: input.reason ?? null
      },
      after: null,
      request: input.request
    });

    throw new UserAdminOperationError(
      "LAST_SUPER_ADMIN_PROTECTED",
      "不能禁用系统最后一个超级管理员。",
      403
    );
  }

  const updated = await prisma.user.update({
    where: {
      id: input.targetUserId
    },
    data: {
      isActive: input.isActive
    },
    select: {
      isActive: true
    }
  });
  const action = updated.isActive ? "enable_user" : "disable_user";

  await writeUserAdminAudit({
    actor: input.actor,
    targetUserId: input.targetUserId,
    action,
    before: {
      isActive: target.isActive,
      role,
      reason: input.reason ?? null
    },
    after: {
      isActive: updated.isActive
    },
    request: input.request
  });

  return {
    userId: input.targetUserId,
    isActive: updated.isActive,
    accountStatus: accountStatus(updated.isActive),
    syncedPlatforms: [...syncedRolePlatforms]
  };
}

export async function getSuperAdminUserAudit(): Promise<SuperAdminUserAuditResponse> {
  const logs = await prisma.auditLog.findMany({
    where: {
      action: {
        in: userAuditActions
      }
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 50,
    select: {
      id: true,
      userId: true,
      action: true,
      targetType: true,
      targetId: true,
      ip: true,
      userAgent: true,
      metadata: true,
      createdAt: true
    }
  });

  return {
    logs: logs.map((log) => {
      const metadata = isRecord(log.metadata) ? log.metadata : {};

      return {
        id: log.id,
        operatorUserId: typeof metadata.operatorUserId === "string" ? metadata.operatorUserId : log.userId,
        targetUserId: typeof metadata.targetUserId === "string" ? metadata.targetUserId : log.targetId,
        action: log.action,
        resourceType: log.targetType,
        resourceId: log.targetId,
        before: metadata.before ?? null,
        after: metadata.after ?? null,
        ip: log.ip,
        userAgent: log.userAgent,
        createdAt: log.createdAt.toISOString()
      };
    })
  };
}
