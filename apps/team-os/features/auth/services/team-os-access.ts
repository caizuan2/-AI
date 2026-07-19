import "server-only";

import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  TEAM_OS_ACTIVATE_PATH,
  TEAM_OS_HOME_PATH
} from "@/apps/team-os/features/auth/constants";
import type { TeamOsFeatureKey } from "@/apps/team-os/features/tenant/types";

export type TeamOsAccessStatus =
  | "ACTIVE"
  | "TEAM_MEMBERSHIP_REQUIRED"
  | "TEAM_MEMBERSHIP_INACTIVE"
  | "TEAM_ORGANIZATION_DISABLED"
  | "MULTI_COMPANY_MEMBERSHIP_CONFLICT"
  | "TENANT_COMPANY_NOT_PROVISIONED"
  | "TENANT_COMPANY_DISABLED"
  | "TENANT_COMPANY_EXPIRED"
  | "TEAM_LICENSE_DISABLED"
  | "SUBSCRIPTION_REQUIRED"
  | "SUBSCRIPTION_INACTIVE"
  | "SUBSCRIPTION_EXPIRED"
  | "SUBSCRIPTION_PLAN_DISABLED";

type TeamOsDeniedStatus = Exclude<TeamOsAccessStatus, "ACTIVE">;

const TEAM_OS_NO_ACCESS_PATH = "/no-access";

const ACCESS_ERROR_DETAILS: Record<
  TeamOsDeniedStatus,
  { code: "LICENSE_REQUIRED" | "FORBIDDEN"; message: string; destination: "activate" | "no-access" }
> = {
  TEAM_MEMBERSHIP_REQUIRED: {
    code: "LICENSE_REQUIRED",
    message: "当前账号尚未加入 AI Team OS 企业，请先使用企业授权码开通或接受成员邀请。",
    destination: "activate"
  },
  TEAM_MEMBERSHIP_INACTIVE: {
    code: "FORBIDDEN",
    message: "当前 AI Team OS 企业成员身份已停用，请联系企业负责人。",
    destination: "no-access"
  },
  TEAM_ORGANIZATION_DISABLED: {
    code: "FORBIDDEN",
    message: "当前 AI Team OS 团队已停用，请联系企业负责人。",
    destination: "no-access"
  },
  MULTI_COMPANY_MEMBERSHIP_CONFLICT: {
    code: "FORBIDDEN",
    message: "当前账号存在多个企业成员身份，已为安全起见暂停访问，请联系平台管理员核对归属。",
    destination: "no-access"
  },
  TENANT_COMPANY_NOT_PROVISIONED: {
    code: "LICENSE_REQUIRED",
    message: "当前企业尚未完成 AI Team OS 开通，请使用企业授权码继续。",
    destination: "activate"
  },
  TENANT_COMPANY_DISABLED: {
    code: "FORBIDDEN",
    message: "当前 AI Team OS 企业已被停用，请联系平台管理员。",
    destination: "no-access"
  },
  TENANT_COMPANY_EXPIRED: {
    code: "LICENSE_REQUIRED",
    message: "当前 AI Team OS 企业授权已到期，请续费后继续使用。",
    destination: "activate"
  },
  TEAM_LICENSE_DISABLED: {
    code: "FORBIDDEN",
    message: "当前 AI Team OS 企业授权已被超级管理员禁用，请联系平台管理员。",
    destination: "no-access"
  },
  SUBSCRIPTION_REQUIRED: {
    code: "LICENSE_REQUIRED",
    message: "当前企业尚未配置 AI Team OS 套餐，请先完成企业激活。",
    destination: "activate"
  },
  SUBSCRIPTION_INACTIVE: {
    code: "LICENSE_REQUIRED",
    message: "当前 AI Team OS 企业套餐未生效或已取消，请联系平台管理员。",
    destination: "activate"
  },
  SUBSCRIPTION_EXPIRED: {
    code: "LICENSE_REQUIRED",
    message: "当前 AI Team OS 企业套餐已到期，请续费后继续使用。",
    destination: "activate"
  },
  SUBSCRIPTION_PLAN_DISABLED: {
    code: "FORBIDDEN",
    message: "当前 AI Team OS 套餐已停用，请联系平台管理员。",
    destination: "no-access"
  }
};

export class TeamOsAccessError extends AppError {
  readonly destination: string;

  constructor(public readonly accessStatus: TeamOsDeniedStatus) {
    const details = ACCESS_ERROR_DETAILS[accessStatus];
    super(details.code, details.message, 403);
    this.name = "TeamOsAccessError";
    this.destination = details.destination === "activate"
      ? `${TEAM_OS_ACTIVATE_PATH}?reason=${encodeURIComponent(accessStatus)}`
      : `${TEAM_OS_NO_ACCESS_PATH}?reason=${encodeURIComponent(accessStatus)}`;
  }
}

type CompanyRecord = Awaited<ReturnType<typeof loadTenantCompanies>>[number];

async function loadTeamOsMemberships(userId: string) {
  return prisma.teamMember.findMany({
    where: { userId },
    select: {
      id: true,
      teamId: true,
      role: true,
      status: true,
      createdAt: true,
      team: {
        select: {
          id: true,
          companyId: true,
          name: true,
          status: true
        }
      }
    },
    orderBy: { createdAt: "asc" }
  });
}

async function loadTenantCompanies(companyIds: string[]) {
  return prisma.tenantCompany.findMany({
    where: { id: { in: companyIds } },
    select: {
      id: true,
      name: true,
      status: true,
      subscriptions: {
        select: {
          id: true,
          planId: true,
          startDate: true,
          endDate: true,
          status: true,
          createdAt: true,
          plan: {
            select: {
              id: true,
              name: true,
              status: true,
              featurePermissions: {
                select: {
                  featureKey: true,
                  enabled: true
                }
              }
            }
          }
        },
        orderBy: [{ endDate: "desc" }, { createdAt: "desc" }]
      }
    }
  });
}

function deniedStatusForCompany(company: CompanyRecord | undefined, now: Date): TeamOsDeniedStatus | null {
  if (!company) {
    return "TENANT_COMPANY_NOT_PROVISIONED";
  }

  if (company.status === "DISABLED") {
    return "TENANT_COMPANY_DISABLED";
  }

  if (company.status === "EXPIRED") {
    return "TENANT_COMPANY_EXPIRED";
  }

  if (company.subscriptions.length === 0) {
    return "SUBSCRIPTION_REQUIRED";
  }

  const activeSubscription = activeSubscriptionForCompany(company, now);
  if (activeSubscription) {
    return null;
  }

  const currentSubscription = company.subscriptions.find(
    (subscription) => subscription.status === "ACTIVE" && subscription.startDate <= now && subscription.endDate > now
  );

  if (!currentSubscription) {
    const expired = company.subscriptions.some(
      (subscription) => subscription.status === "EXPIRED" || subscription.endDate <= now
    );
    return expired ? "SUBSCRIPTION_EXPIRED" : "SUBSCRIPTION_INACTIVE";
  }

  if (currentSubscription.plan.status !== "ACTIVE") {
    return "SUBSCRIPTION_PLAN_DISABLED";
  }

  return "SUBSCRIPTION_INACTIVE";
}

function activeSubscriptionForCompany(company: CompanyRecord, now: Date) {
  return company.subscriptions.find(
    (subscription) =>
      subscription.status === "ACTIVE" &&
      subscription.startDate <= now &&
      subscription.endDate > now &&
      subscription.plan.status === "ACTIVE"
  );
}

async function isUnifiedTeamOsLicenseDisabled(companyId: string) {
  const binding = await prisma.auditLog.findFirst({
    where: {
      action: "redeem_team_os_license_key",
      targetType: "license_key",
      metadata: { path: ["companyId"], equals: companyId }
    },
    orderBy: { createdAt: "desc" },
    select: { targetId: true }
  });
  if (!binding?.targetId) return false;
  const license = await prisma.licenseKey.findUnique({
    where: { id: binding.targetId },
    select: { status: true }
  });
  return !license || license.status === "DISABLED";
}

function firstDeniedStatus(statuses: TeamOsDeniedStatus[]) {
  const priority: TeamOsDeniedStatus[] = [
    "TEAM_LICENSE_DISABLED",
    "TENANT_COMPANY_DISABLED",
    "TENANT_COMPANY_EXPIRED",
    "SUBSCRIPTION_EXPIRED",
    "SUBSCRIPTION_PLAN_DISABLED",
    "SUBSCRIPTION_INACTIVE",
    "SUBSCRIPTION_REQUIRED",
    "TENANT_COMPANY_NOT_PROVISIONED"
  ];

  return priority.find((status) => statuses.includes(status)) ?? "SUBSCRIPTION_REQUIRED";
}

export async function requireTeamOsAccess(request?: Request, featureKey?: TeamOsFeatureKey) {
  void request;
  const user = await requireUser();
  const memberships = await loadTeamOsMemberships(user.id);

  if (memberships.length === 0) {
    throw new TeamOsAccessError("TEAM_MEMBERSHIP_REQUIRED");
  }

  const activeMemberships = memberships.filter((membership) => membership.status === "ACTIVE");
  if (activeMemberships.length === 0) {
    throw new TeamOsAccessError("TEAM_MEMBERSHIP_INACTIVE");
  }

  const activeOrganizationMemberships = activeMemberships.filter(
    (membership) => membership.team.status === "ACTIVE"
  );
  if (activeOrganizationMemberships.length === 0) {
    throw new TeamOsAccessError("TEAM_ORGANIZATION_DISABLED");
  }

  const companyIds = Array.from(
    new Set(activeOrganizationMemberships.map((membership) => membership.team.companyId))
  );
  if (companyIds.length > 1) {
    throw new TeamOsAccessError("MULTI_COMPANY_MEMBERSHIP_CONFLICT");
  }

  const companies = await loadTenantCompanies(companyIds);
  const companyById = new Map(companies.map((company) => [company.id, company]));
  const now = new Date();
  const deniedStatuses: TeamOsDeniedStatus[] = [];

  for (const membership of activeOrganizationMemberships) {
    const company = companyById.get(membership.team.companyId);
    const deniedStatus = deniedStatusForCompany(company, now);

    if (deniedStatus) {
      deniedStatuses.push(deniedStatus);
      continue;
    }

    const subscription = activeSubscriptionForCompany(company!, now)!;
    if (await isUnifiedTeamOsLicenseDisabled(company!.id)) {
      throw new TeamOsAccessError("TEAM_LICENSE_DISABLED");
    }
    if (
      featureKey &&
      !subscription.plan.featurePermissions.some(
        (permission) => permission.featureKey === featureKey && permission.enabled
      )
    ) {
      throw new AppError(
        "FEATURE_DISABLED",
        "当前企业套餐未开通此功能，请联系企业负责人升级套餐。",
        403
      );
    }

    return {
      ...user,
      accessStatus: "ACTIVE" as const,
      companyId: company!.id,
      companyName: company!.name,
      teamId: membership.teamId,
      teamName: membership.team.name,
      company: {
        id: company!.id,
        name: company!.name
      },
      team: {
        id: membership.teamId,
        name: membership.team.name
      },
      role: membership.role,
      roles: [membership.role],
      subscription: {
        id: subscription.id,
        planId: subscription.planId,
        planName: subscription.plan.name,
        expiresAt: subscription.endDate,
        enabledFeatures: subscription.plan.featurePermissions
          .filter((permission) => permission.enabled)
          .map((permission) => permission.featureKey)
      }
    };
  }

  throw new TeamOsAccessError(firstDeniedStatus(deniedStatuses));
}

export type TeamOsAccessUser = Awaited<ReturnType<typeof requireTeamOsAccess>>;

export type TeamOsAccessDecision =
  | {
      allowed: true;
      status: "ACTIVE";
      nextPath: string;
      company: { id: string; name: string };
      team: { id: string; name: string; role: TeamOsAccessUser["role"] };
    }
  | {
      allowed: false;
      status: TeamOsDeniedStatus;
      nextPath: string;
      message: string;
    };

export function toTeamOsAccessDecision(access: TeamOsAccessUser): TeamOsAccessDecision {
  return {
    allowed: true,
    status: "ACTIVE",
    nextPath: TEAM_OS_HOME_PATH,
    company: access.company,
    team: { ...access.team, role: access.role }
  };
}

export function toTeamOsDeniedDecision(error: TeamOsAccessError): TeamOsAccessDecision {
  return {
    allowed: false,
    status: error.accessStatus,
    nextPath: error.destination,
    message: error.message
  };
}
