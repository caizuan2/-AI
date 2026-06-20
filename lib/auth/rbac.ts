import "server-only";

import { prisma } from "@/lib/prisma";
import { requireUser, type AppUser } from "@/lib/auth";
import { checkUserLicense } from "@/lib/auth/license";
import { isAdminUser } from "@/lib/auth/admin-config";
import { writeAuditLog, type AuditAction } from "@/lib/audit-log";
import { ForbiddenError } from "@/lib/errors";
import {
  getHighestRole,
  normalizeAppRole,
  roleSatisfies,
  type AppRole
} from "@/lib/rbac/roles";

export interface RbacUser extends AppUser {
  role: AppRole;
  roles: AppRole[];
}

interface RoleGuardOptions {
  request?: Request;
  requireLicense?: boolean;
  deniedAction?: AuditAction;
  targetType?: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}

function isMissingRoleSchemaError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const value = error as { code?: unknown; message?: unknown };
  const code = typeof value.code === "string" ? value.code : "";
  const message = typeof value.message === "string" ? value.message : "";

  return code === "P2021" || code === "P2022" || /user_role_assignments|UserRoleAssignment/i.test(message);
}

async function getAssignedRoles(userId: string): Promise<AppRole[]> {
  const now = new Date();

  try {
    const assignments = await prisma.userRoleAssignment.findMany({
      where: {
        userId,
        revokedAt: null,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } }
        ]
      },
      select: {
        role: true
      }
    });

    return assignments
      .map((assignment) => normalizeAppRole(assignment.role))
      .filter((role): role is AppRole => Boolean(role));
  } catch (error) {
    if (isMissingRoleSchemaError(error)) {
      return [];
    }

    throw error;
  }
}

async function getBaseUserRole(userId: string): Promise<AppRole | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true
    }
  });

  return normalizeAppRole(user?.role);
}

export async function requireAuth() {
  return requireUser();
}

export async function getUserRoles(user: Pick<AppUser, "id" | "phone">): Promise<AppRole[]> {
  const roles = new Set<AppRole>(["user"]);
  const baseRole = await getBaseUserRole(user.id);

  if (baseRole) {
    roles.add(baseRole);
  }

  if (isAdminUser(user)) {
    roles.add("super_admin");
  }

  for (const role of await getAssignedRoles(user.id)) {
    roles.add(role);
  }

  return Array.from(roles);
}

export async function requireRole(required: AppRole | AppRole[], options: RoleGuardOptions = {}): Promise<RbacUser> {
  const user = await requireUser();
  const roles = await getUserRoles(user);
  const highestRole = getHighestRole(roles);
  const requiredRoles = Array.isArray(required) ? required : [required];
  const allowed = requiredRoles.some((role) => roleSatisfies(highestRole, role));

  if (!allowed) {
    await writeAuditLog({
      userId: user.id,
      role: highestRole,
      action: options.deniedAction ?? "RBAC_ACCESS_DENIED",
      targetType: options.targetType ?? "rbac",
      targetId: options.targetId ?? null,
      request: options.request,
      metadata: {
        requiredRoles,
        actualRole: highestRole,
        ...(options.metadata ?? {})
      }
    });

    throw new ForbiddenError("当前账号没有权限访问该资源。");
  }

  if (options.requireLicense) {
    await checkUserLicense(user.id);
  }

  return {
    ...user,
    role: highestRole,
    roles
  };
}

export function requireKbAdmin(request?: Request, options: Omit<RoleGuardOptions, "request"> = {}) {
  return requireRole("kb_admin", {
    ...options,
    request,
    requireLicense: options.requireLicense ?? true
  });
}

export function requireSuperAdmin(request?: Request, options: Omit<RoleGuardOptions, "request"> = {}) {
  return requireRole("super_admin", {
    ...options,
    request
  });
}
