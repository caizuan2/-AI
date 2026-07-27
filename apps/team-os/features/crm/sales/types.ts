export const CRM_LEAD_SOURCES = [
  "MANUAL",
  "IMPORT",
  "WEBSITE",
  "REFERRAL",
  "AI_PROSPECTING",
  "PARTNER",
  "CAMPAIGN",
  "OTHER"
] as const;

export const CRM_LEAD_STATUSES = [
  "NEW",
  "UNASSIGNED",
  "ASSIGNED",
  "CONTACTED",
  "QUALIFIED",
  "CONVERTED",
  "DISQUALIFIED",
  "RECYCLED"
] as const;

export const CRM_OPPORTUNITY_STAGES = [
  "DISCOVERY",
  "QUALIFICATION",
  "SOLUTION",
  "QUOTATION",
  "NEGOTIATION",
  "CONTRACT",
  "WON",
  "LOST"
] as const;

export const CRM_OPPORTUNITY_STATUSES = ["OPEN", "WON", "LOST", "ON_HOLD"] as const;

export const CRM_CONTRACT_STATUSES = [
  "DRAFT",
  "APPROVING",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED"
] as const;

export const CRM_RECEIVABLE_STATUSES = [
  "PENDING",
  "PARTIAL",
  "PAID",
  "OVERDUE",
  "CANCELLED"
] as const;

export type CrmLeadSource = (typeof CRM_LEAD_SOURCES)[number];
export type CrmLeadStatus = (typeof CRM_LEAD_STATUSES)[number];
export type CrmOpportunityStage = (typeof CRM_OPPORTUNITY_STAGES)[number];
export type CrmOpportunityStatus = (typeof CRM_OPPORTUNITY_STATUSES)[number];
export type CrmContractStatus = (typeof CRM_CONTRACT_STATUSES)[number];
export type CrmReceivableStatus = (typeof CRM_RECEIVABLE_STATUSES)[number];

export type CrmSalesScopeMode = "COMPANY" | "TEAMS" | "OWN";

export interface CrmSalesActor {
  userId: string;
  companyId: string;
  teamRole: "TEAM_OWNER" | "TEAM_MANAGER" | "TRAINER" | "TEAM_MEMBER";
}

export interface CrmSalesAuditContext {
  ip: string | null;
  userAgent: string | null;
}

export interface CrmSalesScope {
  companyId: string;
  mode: CrmSalesScopeMode;
  companyOwner: boolean;
  managerTeamIds: string[];
  memberTeamIds: string[];
  visibleTeamIds: string[];
}

export interface CrmPageFilters {
  q?: string;
  teamId?: string;
  ownerId?: string;
  cursor?: string;
  limit: number;
}

export interface CrmLeadListFilters extends CrmPageFilters {
  source?: CrmLeadSource;
  status?: CrmLeadStatus;
}

export interface CreateCrmLeadInput {
  teamId?: string;
  ownerId?: string;
  name: string;
  companyName?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  wechat?: string;
  industry?: string;
  source: CrmLeadSource;
  sourceDetail?: string;
  score: number;
  scoreReason?: Record<string, unknown>;
  estimatedValue?: string;
  lastContactAt?: string;
  nextFollowUpAt?: string;
  tags: string[];
  notes: string;
}

export interface UpdateCrmLeadInput {
  teamId?: string | null;
  ownerId?: string | null;
  status?: CrmLeadStatus;
  lostReason?: string | null;
  nextFollowUpAt?: string | null;
}

export interface ConvertCrmLeadInput {
  teamId?: string;
  ownerId?: string;
  customerName?: string;
  tags?: string[];
  notes?: string;
  level?: "LOW" | "MEDIUM" | "HIGH";
}

export interface CrmOpportunityListFilters extends CrmPageFilters {
  customerId?: string;
  stage?: CrmOpportunityStage;
  status?: CrmOpportunityStatus;
}

export interface CreateCrmOpportunityInput {
  customerId: string;
  primaryContactId?: string;
  teamId?: string;
  ownerId?: string;
  name: string;
  amount: string;
  probability: number;
  expectedCloseDate?: string;
  nextAction: string;
  competitors: string[];
  decisionChain?: Record<string, unknown>;
}

export interface ChangeCrmOpportunityStageInput {
  toStage: CrmOpportunityStage;
  reason: string;
  probability?: number;
  expectedCloseDate?: string | null;
  nextAction?: string;
}

export interface CrmContractListFilters extends CrmPageFilters {
  customerId?: string;
  opportunityId?: string;
  status?: CrmContractStatus;
}

export interface CreateCrmContractInput {
  customerId: string;
  opportunityId?: string;
  teamId?: string;
  ownerId?: string;
  contractNo: string;
  title: string;
  amount: string;
  signedAt?: string;
  startDate?: string;
  endDate?: string;
  terms?: Record<string, unknown>;
  fileUrls: string[];
  notes: string;
}

export interface ChangeCrmContractStatusInput {
  status: CrmContractStatus;
  reason: string;
  signedAt?: string;
}

export interface CrmReceivableListFilters extends CrmPageFilters {
  customerId?: string;
  contractId?: string;
  status?: CrmReceivableStatus;
  overdueOnly?: boolean;
}

export interface CreateCrmReceivableInput {
  customerId: string;
  contractId: string;
  teamId?: string;
  ownerId?: string;
  installmentNo: number;
  amount: string;
  dueDate: string;
  reminderAt?: string;
  notes: string;
}

export interface RecordCrmPaymentInput {
  amount: string;
  receivedAt?: string;
  notes?: string;
}

export interface CrmListResult<T> {
  items: T[];
  total: number;
  nextCursor?: string;
}

export interface CrmNamedReference {
  id: string;
  name: string;
}

export interface CrmTeamReference {
  id: string;
  name: string;
}

export interface CrmLeadRecord {
  id: string;
  team: CrmTeamReference | null;
  owner?: CrmNamedReference;
  createdById: string;
  name: string;
  companyName?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  wechat?: string;
  industry?: string;
  source: CrmLeadSource;
  sourceDetail?: string;
  status: CrmLeadStatus;
  score: number;
  estimatedValue?: string;
  lastContactAt?: string;
  nextFollowUpAt?: string;
  convertedCustomerId?: string;
  convertedAt?: string;
  lostReason?: string;
  tags: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface CrmOpportunityRecord {
  id: string;
  team: CrmTeamReference | null;
  customer: CrmNamedReference;
  owner: CrmNamedReference;
  primaryContact?: CrmNamedReference;
  name: string;
  stage: CrmOpportunityStage;
  status: CrmOpportunityStatus;
  amount: string;
  probability: number;
  expectedCloseDate?: string;
  nextAction: string;
  competitors: string[];
  lossReason?: string;
  wonAt?: string;
  lostAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CrmContractRecord {
  id: string;
  team: CrmTeamReference | null;
  customer: CrmNamedReference;
  opportunity?: CrmNamedReference;
  owner: CrmNamedReference;
  contractNo: string;
  title: string;
  amount: string;
  status: CrmContractStatus;
  signedAt?: string;
  startDate?: string;
  endDate?: string;
  fileUrls: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface CrmReceivableRecord {
  id: string;
  team: CrmTeamReference | null;
  customer: CrmNamedReference;
  contract: { id: string; contractNo: string; title: string };
  owner?: CrmNamedReference;
  installmentNo: number;
  amount: string;
  receivedAmount: string;
  outstandingAmount: string;
  dueDate: string;
  receivedAt?: string;
  status: CrmReceivableStatus;
  reminderAt?: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface CrmDashboardData {
  scope: {
    companyId: string;
    mode: CrmSalesScopeMode;
    visibleTeamIds: string[];
  };
  leads: {
    total: number;
    byStatus: Record<CrmLeadStatus, number>;
  };
  opportunities: {
    total: number;
    openAmount: string;
    weightedAmount: string;
    byStage: Record<CrmOpportunityStage, { count: number; amount: string }>;
  };
  contracts: {
    total: number;
    activeAmount: string;
    byStatus: Record<CrmContractStatus, { count: number; amount: string }>;
  };
  receivables: {
    totalAmount: string;
    receivedAmount: string;
    outstandingAmount: string;
    overdueAmount: string;
    byStatus: Record<CrmReceivableStatus, { count: number; amount: string }>;
  };
}
