import "server-only";

import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import type {
  TenantAccessState,
  TenantCompanyAccessRecord,
  TenantCompanyOption,
  TenantCompanyStatusValue,
  TenantRole
} from "@/apps/team-os/features/tenant/types";

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function toCompanyStatus(value: string): TenantCompanyStatusValue {
  if (value === "ACTIVE" || value === "DISABLED" || value === "EXPIRED") {
    return value;
  }
  throw new Error("Unsupported tenant company status.");
}

export async function resolveTenantAccess(
  userId: string,
  requestedCompanyId?: string,
  options: { ownerCompaniesOnly?: boolean; preferOwnerCompany?: boolean } = {}
): Promise<TenantAccessState> {
  const memberships = await prisma.teamMember.findMany({
    where: {
      userId,
      status: "ACTIVE",
      team: { status: "ACTIVE" }
    },
    select: {
      role: true,
      teamId: true,
      team: {
        select: {
          id: true,
          companyId: true,
          name: true
        }
      }
    },
    orderBy: { createdAt: "asc" }
  });

  if (memberships.length === 0) {
    throw new ForbiddenError("当前账号尚未加入有效企业团队，无法访问企业中心。");
  }

  const allCompanyIds = unique(memberships.map((membership) => membership.team.companyId));
  const ownerCompanyIds = unique(
    memberships
      .filter((membership) => membership.role === "TEAM_OWNER")
      .map((membership) => membership.team.companyId)
  );
  const companyIds = options.ownerCompaniesOnly ? ownerCompanyIds : allCompanyIds;
  if (options.ownerCompaniesOnly && companyIds.length === 0) {
    throw new ForbiddenError("只有企业负责人可以查看企业使用量。");
  }
  const normalizedRequestedCompanyId = requestedCompanyId?.trim();
  if (requestedCompanyId !== undefined && !normalizedRequestedCompanyId) {
    throw new ValidationError("企业 ID 不能为空。");
  }
  if (normalizedRequestedCompanyId && !companyIds.includes(normalizedRequestedCompanyId)) {
    throw new ForbiddenError("当前账号无权访问所选企业。");
  }

  const preferredOwnerCompanyId = options.preferOwnerCompany ? ownerCompanyIds[0] : undefined;
  const companyId = normalizedRequestedCompanyId ?? preferredOwnerCompanyId ?? companyIds[0];
  const companyMemberships = memberships.filter((membership) => membership.team.companyId === companyId);
  const currentRoles = unique(companyMemberships.map((membership) => membership.role)) as TenantRole[];
  const companyTeamIds = unique(companyMemberships.map((membership) => membership.teamId));
  const isCompanyOwner = currentRoles.includes("TEAM_OWNER");

  const tenantCompanies = await prisma.tenantCompany.findMany({
    where: { id: { in: companyIds } },
    select: {
      id: true,
      name: true,
      logo: true,
      industry: true,
      ownerId: true,
      status: true,
      createdAt: true,
      updatedAt: true
    }
  });
  const companyById = new Map(tenantCompanies.map((company) => [company.id, company]));
  const fallbackNameByCompanyId = new Map<string, string>();
  for (const membership of memberships) {
    if (!fallbackNameByCompanyId.has(membership.team.companyId)) {
      fallbackNameByCompanyId.set(membership.team.companyId, membership.team.name);
    }
  }

  const selectedCompany = companyById.get(companyId);
  const company: TenantCompanyAccessRecord | null = selectedCompany
    ? {
        id: selectedCompany.id,
        name: selectedCompany.name,
        logo: selectedCompany.logo,
        industry: selectedCompany.industry,
        ownerId: selectedCompany.ownerId,
        status: toCompanyStatus(selectedCompany.status),
        createdAt: selectedCompany.createdAt,
        updatedAt: selectedCompany.updatedAt
      }
    : null;
  const isDesignatedOwner = Boolean(company && company.ownerId === userId);
  const companies: TenantCompanyOption[] = companyIds.map((id) => {
    const tenantCompany = companyById.get(id);
    return {
      id,
      name: tenantCompany?.name ?? fallbackNameByCompanyId.get(id) ?? id,
      status: tenantCompany ? toCompanyStatus(tenantCompany.status) : "UNPROVISIONED"
    };
  });

  return {
    context: {
      companyId,
      companyName: company?.name ?? fallbackNameByCompanyId.get(companyId) ?? companyId,
      companies,
      currentRoles,
      permissions: {
        canViewCompany: true,
        canViewSubscription: true,
        canViewUsage: isCompanyOwner,
        canRequestUpgrade: isCompanyOwner && (!company || isDesignatedOwner)
      }
    },
    company,
    isCompanyOwner,
    isDesignatedOwner,
    companyTeamIds
  };
}

export function assertTenantCompanyProvisioned(access: TenantAccessState): TenantCompanyAccessRecord {
  if (!access.company) {
    throw new NotFoundError("企业商业化资料尚未初始化，请联系平台管理员。");
  }
  return access.company;
}

export function assertTenantUsageAccess(access: TenantAccessState) {
  if (!access.context.permissions.canViewUsage) {
    throw new ForbiddenError("只有企业负责人可以查看企业使用量。");
  }
}

export function assertTenantUpgradeAccess(access: TenantAccessState) {
  if (!access.isCompanyOwner) {
    throw new ForbiddenError("只有企业负责人可以申请套餐升级。");
  }
  if (access.company && !access.isDesignatedOwner) {
    throw new ForbiddenError("只有企业登记负责人可以申请套餐升级。");
  }
}
