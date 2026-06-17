import "server-only";

import { prisma } from "@/lib/prisma";
import type { AppRole } from "@/lib/rbac/roles";
import { ForbiddenError, NotFoundError } from "@/lib/errors";

export interface TenantActor {
  id: string;
  role: AppRole;
}

export interface TenantContext {
  tenantId: string;
  tenantName: string;
  tenantPlan: string;
  tenantStatus: string;
  actorUserId: string;
  scope: "tenant";
  readonlyView: boolean;
}

export interface TenantAnalyticsContext {
  tenantId?: string;
  tenantName?: string;
  tenantPlan?: string;
  tenantStatus?: string;
  actorUserId: string;
  scope: "all" | "tenant";
  readonlyView: boolean;
}

function buildPersonalTenantId(userId: string) {
  return `tenant_${userId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function readTenantIdFromRequest(request?: Request) {
  if (!request) {
    return "";
  }

  const headerTenantId = request.headers.get("x-tenant-id")?.trim();

  if (headerTenantId) {
    return headerTenantId;
  }

  try {
    const url = new URL(request.url);

    return url.searchParams.get("tenantId")?.trim() || "";
  } catch {
    return "";
  }
}

async function getTenantOrThrow(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      plan: true,
      status: true
    }
  });

  if (!tenant) {
    throw new NotFoundError("企业租户不存在。");
  }

  return tenant;
}

function assertTenantActive(status: string) {
  if (status !== "active") {
    throw new ForbiddenError("当前企业租户已停用，无法访问知识核心。");
  }
}

async function ensureUserTenant(actor: TenantActor) {
  const user = await prisma.user.findUnique({
    where: { id: actor.id },
    select: {
      id: true,
      tenantId: true,
      name: true,
      phone: true,
      email: true
    }
  });

  if (!user) {
    throw new ForbiddenError("当前用户不存在，无法解析企业租户。");
  }

  if (user.tenantId) {
    const tenant = await getTenantOrThrow(user.tenantId);

    assertTenantActive(tenant.status);

    return tenant;
  }

  const tenantId = buildPersonalTenantId(user.id);
  const tenantName = `${user.name?.trim() || user.phone || user.email || "默认企业"}的企业空间`;

  const tenant = await prisma.$transaction(async (tx) => {
    const created = await tx.tenant.upsert({
      where: { id: tenantId },
      create: {
        id: tenantId,
        name: tenantName,
        plan: "starter",
        status: "active"
      },
      update: {},
      select: {
        id: true,
        name: true,
        plan: true,
        status: true
      }
    });

    await tx.user.update({
      where: { id: user.id },
      data: { tenantId: created.id }
    });

    return created;
  });

  return tenant;
}

export async function resolveTenantContext(actor: TenantActor, request?: Request): Promise<TenantContext> {
  if (actor.role === "super_admin") {
    const requestedTenantId = readTenantIdFromRequest(request);

    if (requestedTenantId) {
      const tenant = await getTenantOrThrow(requestedTenantId);

      return {
        tenantId: tenant.id,
        tenantName: tenant.name,
        tenantPlan: tenant.plan,
        tenantStatus: tenant.status,
        actorUserId: actor.id,
        scope: "tenant",
        readonlyView: true
      };
    }
  }

  const tenant = await ensureUserTenant(actor);

  return {
    tenantId: tenant.id,
    tenantName: tenant.name,
    tenantPlan: tenant.plan,
    tenantStatus: tenant.status,
    actorUserId: actor.id,
    scope: "tenant",
    readonlyView: false
  };
}

export async function resolveAnalyticsTenantContext(actor: TenantActor, request?: Request): Promise<TenantAnalyticsContext> {
  const requestedTenantId = actor.role === "super_admin" ? readTenantIdFromRequest(request) : "";

  if (requestedTenantId) {
    const tenant = await getTenantOrThrow(requestedTenantId);

    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantPlan: tenant.plan,
      tenantStatus: tenant.status,
      actorUserId: actor.id,
      scope: "tenant",
      readonlyView: true
    };
  }

  if (actor.role === "super_admin") {
    return {
      actorUserId: actor.id,
      scope: "all",
      readonlyView: true
    };
  }

  const tenant = await ensureUserTenant(actor);

  return {
    tenantId: tenant.id,
    tenantName: tenant.name,
    tenantPlan: tenant.plan,
    tenantStatus: tenant.status,
    actorUserId: actor.id,
    scope: "tenant",
    readonlyView: false
  };
}

export function buildTenantWhere(context: TenantAnalyticsContext | TenantContext) {
  return context.scope === "tenant" && context.tenantId
    ? { tenantId: context.tenantId }
    : {};
}
