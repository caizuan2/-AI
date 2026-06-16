import {
  getUserById,
  listUsersByTenant,
  updateUserRole
} from "@/lib/saas-core/repositories/user.repository";
import type { PaginationParams, QueryFilter, RepositoryResult, SaaSUser } from "@/types/saas-core";

export type RoleMatrixItem = {
  role: SaaSUser["role"];
  label: string;
  permissions: string[];
};

const roleMatrix: RoleMatrixItem[] = [
  {
    role: "owner",
    label: "企业所有者",
    permissions: ["tenant:manage", "user:manage", "knowledge:manage", "ai:manage"]
  },
  {
    role: "admin",
    label: "企业管理员",
    permissions: ["user:manage", "knowledge:manage", "ai:view"]
  },
  {
    role: "member",
    label: "成员",
    permissions: ["knowledge:view", "knowledge:create", "ai:use"]
  },
  {
    role: "viewer",
    label: "只读成员",
    permissions: ["knowledge:view"]
  }
];

function unwrap<T>(result: RepositoryResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error);
  }

  return result.data;
}

export function getRoleMatrix(): RoleMatrixItem[] {
  return roleMatrix;
}

export async function getTenantUsers(tenantId: string, filter?: QueryFilter, pagination?: PaginationParams): Promise<SaaSUser[]> {
  return unwrap(await listUsersByTenant(tenantId, filter, pagination));
}

export async function getSaaSUser(id: string): Promise<SaaSUser | null> {
  return unwrap(await getUserById(id));
}

export async function changeUserRole(userId: string, role: SaaSUser["role"]): Promise<SaaSUser | null> {
  return unwrap(await updateUserRole(userId, role));
}
