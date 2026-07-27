export const CRM_CONVERSATION_CHANNELS = [
  "CRM_HISTORY",
  "PHONE",
  "WECHAT",
  "WECHAT_WORK",
  "MEETING",
  "ONLINE_MEETING"
] as const;

export const CRM_CONVERSATION_DIRECTIONS = [
  "INBOUND",
  "OUTBOUND",
  "INTERNAL"
] as const;

export const CRM_DAILY_PLAN_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "COMPLETED",
  "CANCELLED"
] as const;

export const CRM_SALES_TARGET_METRICS = [
  "NEW_CUSTOMERS",
  "VISITS",
  "CALLS",
  "OPPORTUNITY_AMOUNT",
  "CONTRACT_AMOUNT",
  "RECEIPT_AMOUNT",
  "SALES_AMOUNT"
] as const;

export const CRM_SALES_TARGET_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED"
] as const;

export const CRM_INTEGRATION_STATUSES = [
  "ACTIVE",
  "PAUSED",
  "ERROR",
  "DISABLED"
] as const;

export const CRM_VISIT_STATUSES = [
  "PLANNED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "MISSED"
] as const;

export type CrmConversationChannel = typeof CRM_CONVERSATION_CHANNELS[number];
export type CrmConversationDirection = typeof CRM_CONVERSATION_DIRECTIONS[number];
export type CrmDailyPlanStatus = typeof CRM_DAILY_PLAN_STATUSES[number];
export type CrmSalesTargetMetric = typeof CRM_SALES_TARGET_METRICS[number];
export type CrmSalesTargetStatus = typeof CRM_SALES_TARGET_STATUSES[number];
export type CrmIntegrationStatus = typeof CRM_INTEGRATION_STATUSES[number];
export type CrmVisitStatus = typeof CRM_VISIT_STATUSES[number];

export type CrmOperationsListInput = {
  teamId?: string;
  customerId?: string;
  cursor?: string;
  limit: number;
  channel?: CrmConversationChannel;
  from?: Date;
  to?: Date;
};

export type CreateConversationInput = {
  teamId?: string;
  customerId: string;
  contactId?: string;
  opportunityId?: string;
  integrationSourceId?: string;
  channel: CrmConversationChannel;
  direction: CrmConversationDirection;
  externalId?: string;
  title: string;
  content: string;
  transcript: string;
  summary: string;
  startedAt: Date;
  endedAt?: Date;
  durationSeconds: number;
  mediaUrls: string[];
  metadata?: Record<string, unknown>;
  consentConfirmed: true;
};

export type CreateDailyPlanInput = {
  teamId?: string;
  planDate: Date;
  status: CrmDailyPlanStatus;
  goals?: Record<string, unknown>;
  keyCustomerIds: string[];
  actionItems?: Array<Record<string, unknown>>;
  completedSummary: string;
};

export type CreateSalesTargetInput = {
  teamId?: string;
  targetUserId?: string;
  metric: CrmSalesTargetMetric;
  periodStart: Date;
  periodEnd: Date;
  targetValue: string;
  status: CrmSalesTargetStatus;
};

export type CreateIntegrationInput = {
  teamId?: string;
  channel: CrmConversationChannel;
  name: string;
  status: CrmIntegrationStatus;
  externalTenantId?: string;
  config?: Record<string, unknown>;
};

export type CreateVisitInput = {
  teamId?: string;
  customerId: string;
  contactId?: string;
  title: string;
  purpose: string;
  plannedStart: Date;
  plannedEnd?: Date;
  address?: string;
  latitude?: string;
  longitude?: string;
};

export type UpdateVisitStatusInput = {
  id: string;
  status: CrmVisitStatus;
  actualStart?: Date;
  actualEnd?: Date;
  signInAt?: Date;
  signInLocation?: string;
  result?: string;
  nextAction?: string;
};

export type DeterministicQualityInspection = {
  score: number;
  validCall: boolean | null;
  matchedRules: Record<string, unknown>;
  needs: string[];
  objections: string[];
  priceRequests: string[];
  sensitiveWords: string[];
  issues: Array<{ code: string; message: string; severity: "LOW" | "MEDIUM" | "HIGH" }>;
  unresolvedQuestions: string[];
  suggestions: string[];
};
