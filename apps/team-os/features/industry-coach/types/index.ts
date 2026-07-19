import type { TeamRole } from "@/apps/team-os/types";

export const INDUSTRY_STANDARD_STATUSES = ["ACTIVE", "DISABLED"] as const;
export const INDUSTRY_COACH_SKILL_KEYS = [
  "ice_breaking",
  "needs_discovery",
  "product_presentation",
  "objection_handling",
  "closing_progress"
] as const;

export type IndustryStandardStatus = (typeof INDUSTRY_STANDARD_STATUSES)[number];
export type IndustryCoachSkillKey = (typeof INDUSTRY_COACH_SKILL_KEYS)[number];

export interface IndustryCompanyOption {
  id: string;
  name: string;
  role: TeamRole;
  canViewCatalog: boolean;
  canManage: boolean;
}

export interface IndustryCatalogContext {
  companyId: string;
  companyName: string;
  companies: IndustryCompanyOption[];
  canViewCatalog: boolean;
  canManage: boolean;
}

export interface IndustryStandardRecord {
  id: string;
  companyId: string;
  category: string;
  title: string;
  content: string;
  version: number;
  status: IndustryStandardStatus;
  createdAt: string;
  updatedAt: string;
}

export interface IndustryStandardsData {
  context: IndustryCatalogContext;
  items: IndustryStandardRecord[];
  total: number;
  activeCount: number;
  truncated: boolean;
}

export interface CoachRuleDimension {
  weight: 20;
  criteria: string[];
}

export interface CoachRuleRules {
  schemaVersion: 1;
  dimensions: Record<IndustryCoachSkillKey, CoachRuleDimension>;
}

export interface CoachRuleRecord {
  id: string;
  companyId: string;
  name: string;
  description: string;
  rules: CoachRuleRules;
  createdAt: string;
}

export interface CoachRulesData {
  context: IndustryCatalogContext;
  items: CoachRuleRecord[];
  total: number;
  truncated: boolean;
}

export interface CreateIndustryStandardInput {
  companyId: string;
  category: string;
  title: string;
  content: string;
  version: number;
  status: IndustryStandardStatus;
}

export interface CreateCoachRuleInput {
  companyId: string;
  name: string;
  description: string;
  rules: CoachRuleRules;
}
