export const TEAM_OS_FEATURE_KEYS = [
  "knowledge",
  "tasks",
  "ai_coach",
  "crm",
  "training",
  "analytics"
] as const;

export type TeamOsFeatureKey = (typeof TEAM_OS_FEATURE_KEYS)[number];

export type TenantCompanyStatusValue = "ACTIVE" | "DISABLED" | "EXPIRED";
export type TenantCompanyOptionStatus = TenantCompanyStatusValue | "UNPROVISIONED";
export type TenantSubscriptionStatusValue = "ACTIVE" | "EXPIRED" | "CANCELLED";
export type SubscriptionPlanStatusValue = "ACTIVE" | "DISABLED";
export type TenantRole = "TEAM_OWNER" | "TEAM_MANAGER" | "TRAINER" | "TEAM_MEMBER";

export interface TenantCompanyOption {
  id: string;
  name: string;
  status: TenantCompanyOptionStatus;
}

export interface TenantPermissions {
  canViewCompany: boolean;
  canViewSubscription: boolean;
  canViewUsage: boolean;
  canRequestUpgrade: boolean;
}

export interface TenantAccessContext {
  companyId: string;
  companyName: string;
  companies: TenantCompanyOption[];
  currentRoles: TenantRole[];
  permissions: TenantPermissions;
}

export interface TenantCompanyAccessRecord {
  id: string;
  name: string;
  logo: string | null;
  industry: string | null;
  ownerId: string;
  status: TenantCompanyStatusValue;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantAccessState {
  context: TenantAccessContext;
  company: TenantCompanyAccessRecord | null;
  isCompanyOwner: boolean;
  isDesignatedOwner: boolean;
  companyTeamIds: string[];
}

export interface TenantFeaturePermissionData {
  featureKey: string;
  enabled: boolean;
}

export interface TenantPlanSummary {
  id: string;
  name: string;
  description: string;
  maxUsers: number;
  maxStorage: number;
  features: string[];
  price: string;
  status: SubscriptionPlanStatusValue;
}

export interface TenantSubscriptionSummary {
  id: string;
  companyId: string;
  status: TenantSubscriptionStatusValue;
  startDate: string;
  endDate: string;
  createdAt: string;
  isEffective: boolean;
  plan: TenantPlanSummary;
  featurePermissions: TenantFeaturePermissionData[];
}

export interface TenantCompanyData {
  context: TenantAccessContext;
  company: {
    id: string;
    name: string;
    provisioned: boolean;
    logo: string | null;
    industry: string | null;
    status: TenantCompanyOptionStatus;
    createdAt: string | null;
    updatedAt: string | null;
    memberCount: number;
    teamCount: number;
    currentPlan: TenantPlanSummary | null;
  };
}

export interface TenantSubscriptionData {
  context: TenantAccessContext;
  subscription: TenantSubscriptionSummary | null;
  availablePlans: TenantPlanSummary[];
  featurePermissions: TenantFeaturePermissionData[];
  upgradeMode: "AUTHORIZATION_REQUIRED";
}

export interface TenantUsageMetric {
  value: number | string | null;
  available: boolean;
  definition: string;
  limit?: number | string | null;
  unit?: string;
}

export interface TenantUsageData {
  context: TenantAccessContext;
  period: {
    startDate: string;
    endDate: string;
    label: string;
  };
  metrics: {
    users: TenantUsageMetric;
    aiCalls: TenantUsageMetric;
    knowledgeItems: TenantUsageMetric;
    crmCustomers: TenantUsageMetric;
    trainingAssignments: TenantUsageMetric;
  };
}

export type FeatureCheckReason =
  | "ENABLED"
  | "COMPANY_NOT_PROVISIONED"
  | "COMPANY_DISABLED"
  | "COMPANY_EXPIRED"
  | "SUBSCRIPTION_MISSING"
  | "SUBSCRIPTION_INACTIVE"
  | "SUBSCRIPTION_EXPIRED"
  | "PLAN_DISABLED"
  | "FEATURE_DISABLED";

export interface FeatureCheckInput {
  companyId?: string;
  featureKey: TeamOsFeatureKey;
}

export interface FeatureCheckData {
  context: TenantAccessContext;
  featureKey: TeamOsFeatureKey;
  enabled: boolean;
  reason: FeatureCheckReason;
  planId: string | null;
  subscriptionId: string | null;
  expiresAt: string | null;
}

export interface UpgradeIntentInput {
  companyId: string;
  targetPlanId: string;
}

export interface UpgradeIntentResult {
  status: "REQUIRES_AUTHORIZATION";
  mutationApplied: false;
  companyId: string;
  targetPlan: TenantPlanSummary;
  message: string;
  authorization: {
    mode: "OPAQUE_SINGLE_USE_GRANT";
    available: false;
  };
}
