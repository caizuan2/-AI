import type { ChatProviderName } from "@/lib/ai/types";
import type { IndustryKnowledgeContextResult } from "@/apps/team-os/services/knowledge-context";

export const CUSTOMER_INTENTS = ["HIGH_INTENT", "HESITANT", "REGULAR", "CHURN_RISK"] as const;
export const CUSTOMER_RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export const CUSTOMER_STAGES = ["LEAD", "CONTACTED", "INTERESTED", "NEGOTIATING", "CUSTOMER", "LOST"] as const;
export const CUSTOMER_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export const CUSTOMER_FOLLOW_UP_TYPES = ["CHAT", "CALL", "MEETING", "OTHER"] as const;

export type CustomerIntent = (typeof CUSTOMER_INTENTS)[number];
export type CustomerRiskLevel = (typeof CUSTOMER_RISK_LEVELS)[number];
export type CustomerStage = (typeof CUSTOMER_STAGES)[number];
export type CustomerLevel = (typeof CUSTOMER_LEVELS)[number];
export type CustomerFollowUpType = (typeof CUSTOMER_FOLLOW_UP_TYPES)[number];

export interface CustomerAiCustomer {
  id: string;
  name: string;
  stage: CustomerStage;
  level: CustomerLevel;
  source: string;
  tags: string[];
  notes: string;
}

export interface CustomerAiFollowUp {
  type: CustomerFollowUpType;
  content: string;
  summary: string;
  nextPlan: string;
  createdAt: string;
}

export interface CustomerAnalysisResult {
  intent: CustomerIntent;
  painPoints: string[];
  riskLevel: CustomerRiskLevel;
  purchaseProbability: number;
  nextAction: string;
}

export interface FollowUpSuggestionResult {
  suggestion: string;
  recommendedScript: string;
}

export interface CustomerAiBaseInput {
  customer: CustomerAiCustomer;
  followUps: CustomerAiFollowUp[];
  conversation: string;
  knowledgeContext: IndustryKnowledgeContextResult;
  provider?: ChatProviderName;
  requestId?: string;
}

export type AnalyzeCustomerInput = CustomerAiBaseInput;

export interface GenerateFollowUpSuggestionInput extends CustomerAiBaseInput {
  profile: CustomerAnalysisResult;
}

export interface CustomerAiProvider {
  analyzeCustomer(input: AnalyzeCustomerInput): Promise<CustomerAnalysisResult>;
  generateFollowUpSuggestion(input: GenerateFollowUpSuggestionInput): Promise<FollowUpSuggestionResult>;
}
