import type { TeamRole } from "@/apps/team-os/types";

export const ANALYTICS_RANGE_DAYS = [7, 30, 90] as const;
export type AnalyticsRangeDays = (typeof ANALYTICS_RANGE_DAYS)[number];
export type AnalyticsScopeMode = "COMPANY" | "TEAM" | "TRAINING" | "SELF";
export type AnalyticsMetricUnit = "PERCENT" | "SCORE" | "COUNT";

export interface AnalyticsCompanyOption {
  id: string;
  name: string;
}

export interface AnalyticsTeamOption {
  id: string;
  companyId: string;
  name: string;
  role: TeamRole;
}

export interface AnalyticsPermissions {
  canViewCompanyDashboard: boolean;
  canViewTeamAnalytics: boolean;
  canViewCrmAnalytics: boolean;
  canViewTrainingAnalytics: boolean;
  canViewAiAnalytics: boolean;
  canGenerateBusinessInsight: boolean;
  canViewPersonalGrowth: boolean;
}

export interface AnalyticsContext {
  companyId: string;
  companyName: string;
  companies: AnalyticsCompanyOption[];
  teams: AnalyticsTeamOption[];
  currentRoles: TeamRole[];
  scopeMode: AnalyticsScopeMode;
  permissions: AnalyticsPermissions;
}

export interface AnalyticsRange {
  days: AnalyticsRangeDays;
  startDate: string;
  endDate: string;
  label: string;
}

export interface AnalyticsMetric {
  value: number | null;
  unit: AnalyticsMetricUnit;
  available: boolean;
  sampleSize: number;
  definition: string;
}

export interface AnalyticsDailyPoint {
  date: string;
  taskCompletionRate: number | null;
  employeeAverageScore: number | null;
  customerConversionRate: number | null;
  trainingCompletionRate: number | null;
  aiOutputCount: number;
}

export interface AnalyticsDashboardData {
  context: AnalyticsContext;
  range: AnalyticsRange;
  generatedAt: string;
  metrics: {
    taskCompletionRate: AnalyticsMetric;
    employeeAverageScore: AnalyticsMetric;
    customerConversionRate: AnalyticsMetric;
    trainingCompletionRate: AnalyticsMetric;
    aiUsageCount: AnalyticsMetric;
  };
  trend: AnalyticsDailyPoint[];
  dataCoverage: string[];
}

export interface EmployeeGrowthItem {
  userId: string;
  employeeName: string;
  teamId: string;
  teamName: string;
  skillScore: number | null;
  taskScore: number | null;
  trainingScore: number | null;
  customerScore: number | null;
  growthScore: number | null;
  growthLevel: "优秀" | "良好" | "成长中" | "需关注" | "暂无数据";
  sources: {
    coachReports: number;
    taskSubmissions: number;
    trainingRecords: number;
    customerProfiles: number;
  };
}

export interface AnalyticsDistributionItem {
  label: string;
  value: number;
}

export interface TeamAnalyticsData {
  context: AnalyticsContext;
  range: AnalyticsRange;
  rankings: EmployeeGrowthItem[];
  abilityDistribution: AnalyticsDistributionItem[];
  growthTrend: Array<{
    date: string;
    employeeAverageScore: number | null;
    trainingAverageScore: number | null;
  }>;
  dataCoverage: string[];
  truncated: boolean;
}

export interface CrmAnalyticsData {
  context: AnalyticsContext;
  range: AnalyticsRange;
  customerCount: number;
  conversionRate: number | null;
  highValueCustomerCount: number;
  riskCustomerCount: number;
  stageDistribution: AnalyticsDistributionItem[];
  funnel: AnalyticsDistributionItem[];
  teamDistribution: AnalyticsDistributionItem[];
  dataCoverage: string[];
}

export interface TrainingAnalyticsData {
  context: AnalyticsContext;
  range: AnalyticsRange;
  assignmentCount: number;
  completedAssignmentCount: number;
  completionRate: number | null;
  averageScore: number | null;
  scoredRecordCount: number;
  evaluatedCount: number;
  coursePerformance: Array<{
    courseId: string;
    title: string;
    assignmentCount: number;
    completedCount: number;
    completionRate: number | null;
    averageScore: number | null;
  }>;
  improvementTrend: Array<{
    date: string;
    averageScore: number | null;
    evaluationCount: number;
  }>;
  dataCoverage: string[];
  truncated: boolean;
}

export interface AiAnalyticsData {
  context: AnalyticsContext;
  range: AnalyticsRange;
  scopeLabel: string;
  aiUsageCount: number | null;
  trackedOutputCount: number;
  coachReportCount: number;
  crmProfileCount: number;
  trainingEvaluationCount: number;
  suggestionExecutionRate: number | null;
  knowledgeCallCount: number | null;
  usageTrend: Array<{
    date: string;
    coachReportCount: number;
    crmProfileUpdateCount: number;
    trainingEvaluationCount: number;
    total: number;
  }>;
  unavailableMetrics: string[];
  dataCoverage: string[];
}

export interface BusinessInsightInput {
  companyId?: string;
  days: AnalyticsRangeDays;
}

export interface BusinessInsightData {
  context: AnalyticsContext;
  range: AnalyticsRange;
  summary: string;
  highlights: string[];
  risks: string[];
  actions: string[];
  generatedAt: string;
}

export interface AnalyticsQuery {
  companyId?: string;
  days: AnalyticsRangeDays;
}

export interface ApiSuccessEnvelope<T> {
  ok: true;
  success: true;
  data: T;
}

export interface ApiErrorEnvelope {
  ok: false;
  success: false;
  code?: string;
  message?: string;
  error?: { code?: string; message?: string };
}
