import type { LicenseKeyStatus } from "@prisma/client";

export const SUPER_ADMIN_DEFAULT_RESET_PASSWORD = "123456789";

export type UnifiedLicenseProduct = "user_app" | "ingest_admin" | "team_os";

// Historical records may still contain this value, but new cards are only
// generated for the three unified products above.
export type SuperAdminLicenseAppType = UnifiedLicenseProduct | "super_admin";

export type SuperAdminLicensePlan = "free" | "pro" | "enterprise";

export type SuperAdminLicenseGenerationInput = {
  appType?: UnifiedLicenseProduct;
  plan?: SuperAdminLicensePlan;
  count?: number;
  expiresInDays?: number | null;
  subscriptionDays?: number | null;
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
  subscriptionDays: number | null;
};

export type SuperAdminLicenseRecord = {
  id: string;
  displayKey: string;
  canReveal: boolean;
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
  redeemedByUserAccount: string | null;
  teamOsCompanyId: string | null;
  teamOsTeamId: string | null;
  subscriptionDays: number | null;
  subscriptionEndsAt: string | null;
};

export type SuperAdminLicenseActivationRecord = {
  id: string;
  licenseId: string | null;
  displayKey: string;
  appType: SuperAdminLicenseAppType | null;
  userId: string;
  success: boolean;
  message: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};

export type SuperAdminLicenseRevealResult = {
  id: string;
  key: string;
};

export type SuperAdminLicensePasswordResetResult = {
  licenseId: string;
  userId: string;
  userAccount: string;
  resetAt: string;
};

export type SuperAdminLicenseAccountRecord = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  account: string;
  role: string;
  roleLabel: string;
  appType: UnifiedLicenseProduct;
  isActive: boolean;
  licenseActivated: boolean;
  linkedLicenseCount: number;
  passwordResetAt: string | null;
};

export type SuperAdminLicenseAccountPasswordResetResult = {
  userId: string;
  userAccount: string;
  appType: UnifiedLicenseProduct;
  resetAt: string;
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
  activations: SuperAdminLicenseActivationRecord[];
  audit: SuperAdminLicenseAuditRecord[];
};

export type SuperAdminLicenseGenerationResult = {
  generated: SuperAdminGeneratedLicense[];
  summary: SuperAdminLicenseSummary;
};

export type SuperAdminLicenseRenewalInput = {
  days?: number;
};
