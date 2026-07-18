import type { TeamRole } from "@/apps/team-os/types";

export const KNOWLEDGE_CANDIDATE_SOURCE_TYPES = [
  "CHAT",
  "CRM",
  "AI_COACH",
  "TRAINING",
  "WORKFLOW"
] as const;
export const KNOWLEDGE_CANDIDATE_STATUSES = [
  "PENDING",
  "REVIEWING",
  "APPROVED",
  "REJECTED"
] as const;
export const KNOWLEDGE_FEEDBACK_TYPES = ["GOOD", "BAD", "MISSING"] as const;
export const KNOWLEDGE_OPTIMIZATION_STATUSES = ["PENDING", "APPLIED", "REJECTED"] as const;

export type KnowledgeCandidateSourceType = (typeof KNOWLEDGE_CANDIDATE_SOURCE_TYPES)[number];
export type KnowledgeCandidateStatus = (typeof KNOWLEDGE_CANDIDATE_STATUSES)[number];
export type KnowledgeFeedbackType = (typeof KNOWLEDGE_FEEDBACK_TYPES)[number];
export type KnowledgeOptimizationStatus = (typeof KNOWLEDGE_OPTIMIZATION_STATUSES)[number];
export type AiBrainPermissionLevel = "OWNER" | "MANAGER" | "TRAINER" | "MEMBER";

export interface AiBrainCompanyOption {
  id: string;
  name: string;
}

export interface AiBrainTeamOption {
  id: string;
  name: string;
  role: TeamRole;
}

export interface AiBrainContext {
  companyId: string;
  companyName: string;
  companies: AiBrainCompanyOption[];
  teams: AiBrainTeamOption[];
  permissionLevel: AiBrainPermissionLevel;
  visibleTeamIds: string[];
  feedbackTeamIds: string[];
  canViewAnalysis: boolean;
  canExtract: boolean;
  canOptimize: boolean;
  canReview: boolean;
  canSubmitFeedback: boolean;
  extractSourceTypes: KnowledgeCandidateSourceType[];
}

export interface KnowledgeCandidateRecord {
  id: string;
  companyId: string;
  teamId?: string;
  sourceType: KnowledgeCandidateSourceType;
  sourceId: string;
  title: string;
  content: string;
  category: string;
  status: KnowledgeCandidateStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  publishedKnowledgeId?: string;
  reviewNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeFeedbackRecord {
  id: string;
  companyId: string;
  teamId?: string;
  userId: string;
  question: string;
  answer: string;
  feedbackType: KnowledgeFeedbackType;
  comment: string;
  createdAt: string;
}

export interface KnowledgeOptimizationRecord {
  id: string;
  companyId: string;
  teamId?: string;
  knowledgeId: string;
  suggestion: string;
  status: KnowledgeOptimizationStatus;
  createdAt: string;
}

export interface KnowledgeGrowthPoint {
  date: string;
  count: number;
}

export interface AiBrainStats {
  candidateCount: number;
  pendingCount: number;
  reviewingCount: number;
  approvedCount: number;
  pendingOptimizationCount: number;
  negativeFeedbackCount: number;
}

export interface AiBrainDashboardData {
  context: AiBrainContext;
  stats: AiBrainStats;
  growth: KnowledgeGrowthPoint[];
  candidates: KnowledgeCandidateRecord[];
}

export interface AiBrainFeedbackData {
  context: AiBrainContext;
  items: KnowledgeFeedbackRecord[];
}

export interface AiBrainOptimizationData {
  context: AiBrainContext;
  items: KnowledgeOptimizationRecord[];
}

export interface ExtractKnowledgeInput {
  companyId?: string;
  teamId?: string;
  sourceType: KnowledgeCandidateSourceType;
  sourceId: string;
}

export interface CreateKnowledgeFeedbackInput {
  companyId?: string;
  teamId?: string;
  question: string;
  answer?: string;
  feedbackType: KnowledgeFeedbackType;
  comment?: string;
}

export interface OptimizeKnowledgeInput {
  companyId?: string;
}

export interface ReviewKnowledgeInput {
  companyId?: string;
  candidateId: string;
  decision: "APPROVE" | "REJECT";
  note?: string;
}

export interface KnowledgeExtractionMaterial {
  companyId: string;
  teamId?: string;
  sourceType: KnowledgeCandidateSourceType;
  sourceId: string;
  title: string;
  content: string;
  category: string;
  qualityScore: number;
  reason: string;
}

export interface KnowledgePublishResult {
  publishedKnowledgeId: string;
  stage: string;
}

export interface AiBrainApiSuccess<T> {
  ok: true;
  success: true;
  data: T;
}

export interface AiBrainApiError {
  ok: false;
  success: false;
  code?: string;
  message?: string;
  error?: { code?: string; message?: string };
}
