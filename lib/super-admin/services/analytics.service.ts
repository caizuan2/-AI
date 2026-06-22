import { quickActions } from "@/lib/enterprise/mock-data";
import type { QuickAction } from "@/types/super-admin";

export type SuperAdminAnalyticsSummary = {
  questionTotalToday: number;
  aiCallTotalToday: number;
  abnormalRequestCount: number;
  knowledgeDocumentCount: number;
};

const analyticsSummary: SuperAdminAnalyticsSummary = {
  questionTotalToday: 1286,
  aiCallTotalToday: 8642,
  abnormalRequestCount: 18,
  knowledgeDocumentCount: 24860
};

export function getAnalyticsSummary(): SuperAdminAnalyticsSummary {
  return analyticsSummary;
}

export function getQuickActions(): QuickAction[] {
  return quickActions;
}
