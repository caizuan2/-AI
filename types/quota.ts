import type { PlanType } from "@/types/subscription";

export type QuotaLimit = number | "unlimited";

export type QuotaAction =
  | "ai_request"
  | "upload_document"
  | "add_user"
  | "add_knowledge"
  | "unknown";

export type QuotaPolicy = {
  plan: PlanType;
  dailyAiRequests: QuotaLimit;
  monthlyAiRequests: QuotaLimit;
  maxUsers: QuotaLimit;
  maxKnowledgeDocuments: QuotaLimit;
  maxUploadSizeMB: QuotaLimit;
};

export type QuotaUsage = {
  tenantId: string;
  dailyAiRequests: number;
  monthlyAiRequests: number;
  userCount: number;
  knowledgeDocuments: number;
  uploadCount: number;
};

export type QuotaCheckResult = {
  allowed: boolean;
  reason?: string;
  plan: PlanType;
  limit?: QuotaLimit;
  used?: number;
  remaining?: QuotaLimit;
};
