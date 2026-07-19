import type { TeamRole } from "@/apps/team-os/types";

export const CUSTOMER_STAGES = [
  "LEAD",
  "CONTACTED",
  "INTERESTED",
  "NEGOTIATING",
  "CUSTOMER",
  "LOST"
] as const;
export const CUSTOMER_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export const CUSTOMER_FOLLOW_UP_TYPES = ["CHAT", "CALL", "MEETING", "OTHER"] as const;
export const CUSTOMER_RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export const CUSTOMER_INTENTS = ["HIGH_INTENT", "HESITANT", "REGULAR", "CHURN_RISK"] as const;

export type CustomerStage = (typeof CUSTOMER_STAGES)[number];
export type CustomerLevel = (typeof CUSTOMER_LEVELS)[number];
export type CustomerFollowUpType = (typeof CUSTOMER_FOLLOW_UP_TYPES)[number];
export type CustomerRiskLevel = (typeof CUSTOMER_RISK_LEVELS)[number];
export type CustomerIntent = (typeof CUSTOMER_INTENTS)[number];

export interface CrmCompanyOption {
  id: string;
  name: string;
}

export interface CrmOwnerOption {
  id: string;
  name: string;
}

export interface CrmTeamOption {
  id: string;
  companyId: string;
  name: string;
  role: TeamRole;
  canViewTeam: boolean;
  canCreateCustomer: boolean;
}

export interface CrmContext {
  companyId: string;
  companyName: string;
  companies: CrmCompanyOption[];
  teams: CrmTeamOption[];
  selectedTeamId: string;
  ownerOptions: CrmOwnerOption[];
  canCreateCustomer: boolean;
}

export interface CustomerListItem {
  id: string;
  name: string;
  teamId: string;
  teamName: string;
  ownerId: string;
  ownerName: string;
  source: string;
  tags: string[];
  stage: CustomerStage;
  level: CustomerLevel;
  lastFollowUpAt?: string;
  updatedAt: string;
}

export interface CustomerListData {
  context: CrmContext;
  items: CustomerListItem[];
  facets: {
    tags: string[];
  };
  total: number;
  nextCursor?: string;
}

export interface CustomerRecord extends CustomerListItem {
  companyId: string;
  phone?: string;
  wechat?: string;
  notes: string;
  createdAt: string;
}

export interface CustomerFollowUpRecord {
  id: string;
  customerId: string;
  userId: string;
  userName: string;
  content: string;
  summary: string;
  nextPlan: string;
  type: CustomerFollowUpType;
  aiSuggestion?: string;
  aiRecommendedScript?: string;
  createdAt: string;
}

export interface CustomerAIProfileRecord {
  id: string;
  customerId: string;
  intent: CustomerIntent;
  painPoints: string[];
  riskLevel: CustomerRiskLevel;
  purchaseProbability: number;
  nextAction: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerDetailPermissions {
  canAddFollowUp: boolean;
  canAnalyze: boolean;
}

export interface CustomerDetailData {
  customer: CustomerRecord;
  followUps: CustomerFollowUpRecord[];
  aiProfile?: CustomerAIProfileRecord;
  followUpsTruncated: boolean;
  permissions: CustomerDetailPermissions;
}

export interface CustomerListFilters {
  companyId?: string;
  teamId?: string;
  search?: string;
  stage?: CustomerStage;
  level?: CustomerLevel;
  tag?: string;
  cursor?: string;
  limit: number;
}

export interface CreateCustomerInput {
  teamId: string;
  ownerId?: string;
  name: string;
  phone?: string;
  wechat?: string;
  source: string;
  tags: string[];
  notes: string;
}

export interface CreateCustomerResult {
  customerId: string;
}

export interface CreateCustomerFollowUpInput {
  customerId: string;
  content: string;
  summary: string;
  nextPlan: string;
  type: CustomerFollowUpType;
}

export interface AnalyzeCustomerInput {
  customerId: string;
  conversation?: string;
}

export interface CustomerFollowUpSuggestionRecord {
  suggestion: string;
  recommendedScript: string;
}

export interface AnalyzeCustomerResult {
  profile: CustomerAIProfileRecord;
  suggestion: CustomerFollowUpSuggestionRecord;
  knowledgeContextMode: string;
}

export interface ApiSuccessEnvelope<T> {
  ok: true;
  success: true;
  data: T;
}

export interface ApiErrorEnvelope {
  ok?: false;
  success: false;
  code?: string;
  message?: string;
  error?: {
    code?: string;
    message?: string;
  };
}
