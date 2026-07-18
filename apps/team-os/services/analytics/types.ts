import type { ChatProviderName } from "@/lib/ai/types";

export interface BusinessInsightAggregateInput {
  dashboard: {
    taskCompletionRate: number | null;
    employeeAverageScore: number | null;
    customerConversionRate: number | null;
    trainingCompletionRate: number | null;
    trackedAiOutputCount: number;
  };
  team: {
    uniqueEmployeeCount: number;
    averageGrowthScore: number | null;
    attentionCount: number;
  };
  crm: {
    customerCount: number;
    conversionRate: number | null;
    highValueCustomerCount: number;
    riskCustomerCount: number;
  };
  training: {
    assignmentCount: number;
    completionRate: number | null;
    averageScore: number | null;
  };
  ai: {
    trackedOutputCount: number;
    coachReportCount: number;
    crmProfileCount: number;
    trainingEvaluationCount: number;
  };
  dataCoverage: string[];
  provider?: ChatProviderName;
  requestId?: string;
}

export interface BusinessInsightResult {
  summary: string;
  highlights: string[];
  risks: string[];
  actions: string[];
}

export interface AnalyticsAiProvider {
  generateInsight(input: BusinessInsightAggregateInput): Promise<BusinessInsightResult>;
}

export interface AnalyticsAiDependencies {
  provider?: AnalyticsAiProvider;
}
