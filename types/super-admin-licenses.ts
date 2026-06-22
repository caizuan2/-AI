import type { LicenseKeyStatus } from "@prisma/client";

export type SuperAdminLicenseAppType = "user_app" | "ingest_admin" | "super_admin";

export type SuperAdminLicensePlan = "free" | "pro" | "enterprise";

export type SuperAdminLicenseGenerationInput = {
  appType?: SuperAdminLicenseAppType;
  plan?: SuperAdminLicensePlan;
  count?: number;
  expiresInDays?: number | null;
  maxActivations?: number | null;
  tenantId?: string | null;
  note?: string | null;
};

export type SuperAdminGeneratedLicense = {
  id: string;
  key: string;
  appType: SuperAdminLicenseAppType;
  plan: SuperAdminLicensePlan;
  status: LicenseKeyStatus;
  expiresAt: string | null;
};

export type SuperAdminLicenseRecord = {
  id: string;
  displayKey: string;
  appType: SuperAdminLicenseAppType;
  plan: SuperAdminLicensePlan;
  status: LicenseKeyStatus;
  tenantId: string | null;
  note: string | null;
  maxActivations: number;
  activationCount: number;
  createdAt: string;
  expiresAt: string | null;
  activatedAt: string | null;
  redeemedAt: string | null;
  redeemedByUserId: string | null;
  redeemedByUserLabel: string | null;
};

export type SuperAdminLicenseSummary = {
  total: number;
  unused: number;
  used: number;
  disabled: number;
  expiringSoon: number;
  byAppType: Record<SuperAdminLicenseAppType, number>;
};

export type SuperAdminLicenseAuditRecord = {
  id: string;
  action: string;
  targetId: string | null;
  operatorUserId: string | null;
  role: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  metadata: unknown;
};

export type SuperAdminLicenseDashboardData = {
  summary: SuperAdminLicenseSummary;
  licenses: SuperAdminLicenseRecord[];
  audit: SuperAdminLicenseAuditRecord[];
};

export type SuperAdminLicenseGenerationResult = {
  generated: SuperAdminGeneratedLicense[];
  summary: SuperAdminLicenseSummary;
};
