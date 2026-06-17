import "server-only";

import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import type { TenantContext } from "@/lib/core/tenant-context";

export type SaasLicenseType = "trial" | "pro" | "enterprise" | "legacy";
export type SaasLicenseStatus = "unused" | "active" | "disabled" | "expired";
export type LicenseFeature = "ai" | "ingest" | "chat" | "embedding";

export interface LicenseGateActor {
  id: string;
}

export interface LicenseGateResult {
  active: boolean;
  source: "saas" | "legacy";
  licenseId: string | null;
  type: SaasLicenseType;
  status: SaasLicenseStatus;
  expiresAt: string | null;
  features: Record<LicenseFeature, boolean>;
}

const LICENSE_PREFIX = "SAAS";
const LICENSE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const featureMatrix: Record<SaasLicenseType, Record<LicenseFeature, boolean>> = {
  trial: {
    ai: true,
    ingest: true,
    chat: true,
    embedding: false
  },
  pro: {
    ai: true,
    ingest: true,
    chat: true,
    embedding: true
  },
  enterprise: {
    ai: true,
    ingest: true,
    chat: true,
    embedding: true
  },
  legacy: {
    ai: true,
    ingest: true,
    chat: true,
    embedding: true
  }
};

function normalizeLicenseType(value: string | null | undefined): SaasLicenseType {
  return value === "trial" || value === "pro" || value === "enterprise" ? value : "trial";
}

function normalizeStatus(value: string | null | undefined, expiresAt?: Date | null): SaasLicenseStatus {
  if (expiresAt && expiresAt <= new Date()) {
    return "expired";
  }

  return value === "unused" || value === "active" || value === "disabled" || value === "expired" ? value : "unused";
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function randomGroup(length: number) {
  const bytes = randomBytes(length);

  return Array.from(bytes, (byte) => LICENSE_ALPHABET[byte % LICENSE_ALPHABET.length]).join("");
}

export function generateSaasLicenseCode(type: SaasLicenseType = "pro") {
  const normalizedType = type === "enterprise" ? "ENT" : type === "trial" ? "TRL" : "PRO";

  return `${LICENSE_PREFIX}-${normalizedType}-${randomGroup(4)}-${randomGroup(4)}-${randomGroup(4)}`;
}

function serializeGate(input: {
  source: LicenseGateResult["source"];
  licenseId: string | null;
  type: SaasLicenseType;
  status: SaasLicenseStatus;
  expiresAt?: Date | null;
}): LicenseGateResult {
  const active = input.status === "active";

  return {
    active,
    source: input.source,
    licenseId: input.licenseId,
    type: input.type,
    status: input.status,
    expiresAt: input.expiresAt?.toISOString() ?? null,
    features: active ? featureMatrix[input.type] : {
      ai: false,
      ingest: false,
      chat: false,
      embedding: false
    }
  };
}

export async function getSaasLicenseStatus(actor: LicenseGateActor, tenant?: Pick<TenantContext, "tenantId"> | null) {
  const license = await prisma.license.findFirst({
    where: {
      OR: [
        { userId: actor.id },
        ...(tenant?.tenantId ? [{ tenantId: tenant.tenantId }] : [])
      ],
      status: {
        in: ["active", "expired", "disabled"]
      }
    },
    orderBy: [
      { activatedAt: "desc" },
      { createdAt: "desc" }
    ]
  });

  if (license) {
    const status = normalizeStatus(license.status, license.expiresAt);

    return serializeGate({
      source: "saas",
      licenseId: license.id,
      type: normalizeLicenseType(license.type),
      status,
      expiresAt: license.expiresAt
    });
  }

  const legacyUser = await prisma.user.findUnique({
    where: { id: actor.id },
    select: {
      licenseActivated: true,
      isActive: true
    }
  });

  if (legacyUser?.isActive && legacyUser.licenseActivated) {
    return serializeGate({
      source: "legacy",
      licenseId: null,
      type: "legacy",
      status: "active"
    });
  }

  return serializeGate({
    source: "saas",
    licenseId: null,
    type: "trial",
    status: "unused"
  });
}

export async function assertLicenseFeature(actor: LicenseGateActor, tenant: Pick<TenantContext, "tenantId">, feature: LicenseFeature) {
  const status = await getSaasLicenseStatus(actor, tenant);

  if (!status.active || !status.features[feature]) {
    throw new ForbiddenError("License not active");
  }

  return status;
}

export async function activateSaasLicense(actor: LicenseGateActor, tenant: Pick<TenantContext, "tenantId">, code: string) {
  const normalizedCode = normalizeCode(code);

  if (!normalizedCode) {
    throw new ValidationError("请输入卡密。");
  }

  const license = await prisma.license.findUnique({
    where: { code: normalizedCode }
  });

  if (!license) {
    throw new NotFoundError("卡密不存在。");
  }

  const status = normalizeStatus(license.status, license.expiresAt);

  if (status === "disabled") {
    throw new ForbiddenError("卡密已禁用。");
  }

  if (status === "expired") {
    await prisma.license.update({
      where: { id: license.id },
      data: { status: "expired" }
    }).catch(() => undefined);
    throw new ForbiddenError("卡密已过期。");
  }

  if (status === "active" && license.userId && license.userId !== actor.id && license.tenantId !== tenant.tenantId) {
    throw new ForbiddenError("卡密已被其他账号或企业使用。");
  }

  const activated = await prisma.$transaction(async (tx) => {
    const updated = await tx.license.update({
      where: { id: license.id },
      data: {
        status: "active",
        userId: license.userId ?? actor.id,
        tenantId: license.tenantId ?? tenant.tenantId,
        activatedAt: license.activatedAt ?? new Date()
      }
    });

    await tx.user.update({
      where: { id: actor.id },
      data: { licenseActivated: true }
    }).catch(() => undefined);

    return updated;
  });

  return serializeGate({
    source: "saas",
    licenseId: activated.id,
    type: normalizeLicenseType(activated.type),
    status: normalizeStatus(activated.status, activated.expiresAt),
    expiresAt: activated.expiresAt
  });
}

export async function createSaasLicenses(input: {
  count: number;
  type: SaasLicenseType;
  expiresAt?: Date | null;
}) {
  const count = Math.min(200, Math.max(1, Math.round(input.count)));
  const type = normalizeLicenseType(input.type);
  const codes = new Set<string>();

  while (codes.size < count) {
    codes.add(generateSaasLicenseCode(type));
  }

  await prisma.license.createMany({
    data: Array.from(codes).map((code) => ({
      code,
      type,
      status: "unused",
      expiresAt: input.expiresAt ?? null
    })),
    skipDuplicates: true
  });

  return Array.from(codes);
}

export async function listSaasLicenses(take = 100) {
  const licenses = await prisma.license.findMany({
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      code: true,
      type: true,
      status: true,
      userId: true,
      tenantId: true,
      expiresAt: true,
      activatedAt: true,
      createdAt: true
    }
  });

  return licenses.map((license) => ({
    id: license.id,
    code: license.code,
    type: normalizeLicenseType(license.type),
    status: normalizeStatus(license.status, license.expiresAt),
    userId: license.userId,
    tenantId: license.tenantId,
    expiresAt: license.expiresAt?.toISOString() ?? null,
    activatedAt: license.activatedAt?.toISOString() ?? null,
    createdAt: license.createdAt.toISOString()
  }));
}
