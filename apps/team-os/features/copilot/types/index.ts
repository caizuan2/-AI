import type { NotificationType } from "@/apps/team-os/features/notification/types";

export const COPILOT_ASSISTANT_ROLES = [
  "EMPLOYEE_ASSISTANT",
  "MANAGER_ASSISTANT",
  "OWNER_ASSISTANT"
] as const;

export const COPILOT_INSIGHT_TYPES = ["TASK", "CRM", "TRAINING", "TEAM", "BUSINESS"] as const;
export const COPILOT_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;

export type CopilotAssistantRole = (typeof COPILOT_ASSISTANT_ROLES)[number];
export type CopilotInsightType = (typeof COPILOT_INSIGHT_TYPES)[number];
export type CopilotPriority = (typeof COPILOT_PRIORITIES)[number];
export type CopilotScopeMode = "SELF" | "TEAM" | "COMPANY";

export interface CopilotCompanyOption {
  id: string;
  name: string;
}

export interface CopilotAccessContext {
  companyId: string;
  companyName: string;
  companies: CopilotCompanyOption[];
  assistantRole: CopilotAssistantRole;
  scopeMode: CopilotScopeMode;
  teamIds: string[];
  availableRoles: CopilotAssistantRole[];
}

export interface CopilotMetric {
  id: string;
  label: string;
  value: string;
  description: string;
  tone: "indigo" | "emerald" | "amber" | "rose" | "sky";
}

export interface CopilotActionCard {
  id: string;
  type: CopilotInsightType;
  title: string;
  description: string;
  priority: CopilotPriority;
  href?: string;
  meta?: string;
}

export interface CopilotSection {
  id: string;
  title: string;
  description: string;
  emptyMessage: string;
  items: CopilotActionCard[];
}

export interface CopilotInsightCandidate {
  sourceKey: string;
  type: CopilotInsightType;
  title: string;
  content: string;
  recommendation: string;
  priority: CopilotPriority;
  teamId?: string;
  href?: string;
  notificationType: NotificationType;
}

export interface CopilotDashboardData {
  context: CopilotAccessContext;
  title: string;
  description: string;
  greeting: string;
  summary: string;
  metrics: CopilotMetric[];
  sections: CopilotSection[];
  insights: CopilotInsightCandidate[];
  suggestedQuestions: string[];
  generatedAt: string;
}

export interface CopilotInsightRecord {
  id: string;
  sourceKey: string;
  companyId: string;
  teamId?: string;
  assistantRole: CopilotAssistantRole;
  type: CopilotInsightType;
  title: string;
  content: string;
  recommendation: string;
  priority: CopilotPriority;
  createdAt: string;
}

export interface CopilotInsightsData {
  context: CopilotAccessContext;
  items: CopilotInsightRecord[];
  generatedAt: string;
}

export interface CopilotChatMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface CopilotChatInput {
  assistantRole: CopilotAssistantRole;
  companyId?: string;
  message: string;
}

export interface CopilotChatResult {
  sessionId: string;
  assistantRole: CopilotAssistantRole;
  answer: string;
  provider: string;
  fallbackUsed: boolean;
  conversation: CopilotChatMessage[];
}

export interface CopilotInsightSyncInput {
  assistantRole: CopilotAssistantRole;
  companyId?: string;
}

export interface CopilotInsightSyncResult {
  context: CopilotAccessContext;
  createdInsightCount: number;
  createdRecommendationCount: number;
  notificationCount: number;
  items: CopilotInsightRecord[];
}

export interface EmployeeTaskSnapshot {
  id: string;
  teamId: string;
  teamName: string;
  title: string;
  deadline: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  submittedByCurrentUser: boolean;
  overdue: boolean;
}

export interface EmployeeCustomerSnapshot {
  id: string;
  teamId: string;
  maskedName: string;
  lastFollowUpAt?: string;
  riskLevel?: "LOW" | "MEDIUM" | "HIGH";
  daysSinceFollowUp: number;
}

export interface EmployeeTrainingSnapshot {
  id: string;
  teamId: string;
  courseTitle: string;
  deadline: string;
  status: "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  overdue: boolean;
}

export interface EmployeeGrowthSnapshot {
  score: number;
  problems: string[];
  suggestions: string[];
  trainingPlan: string;
  createdAt: string;
}

export interface EmployeeCopilotSnapshot {
  tasks: EmployeeTaskSnapshot[];
  customers: EmployeeCustomerSnapshot[];
  training: EmployeeTrainingSnapshot[];
  growth?: EmployeeGrowthSnapshot;
}

export interface ManagerMemberSnapshot {
  userId: string;
  teamId: string;
  teamName: string;
  employeeName: string;
  submissionCount: number;
  coachScore?: number;
}

export interface ManagerCopilotSnapshot {
  taskTotal: number;
  taskCompleted: number;
  overdueTaskCount: number;
  members: ManagerMemberSnapshot[];
  customerRisks: Array<{
    id: string;
    teamId: string;
    maskedName: string;
    ownerName: string;
    riskLevel: "LOW" | "MEDIUM" | "HIGH";
    daysSinceFollowUp: number;
  }>;
  openTrainingCount: number;
  overdueTrainingCount: number;
}

export interface OwnerCopilotSnapshot {
  taskCompletionRate: number | null;
  employeeAverageScore: number | null;
  customerConversionRate: number | null;
  trainingCompletionRate: number | null;
  aiUsageCount: number | null;
  attentionEmployeeCount: number;
  customerCount: number;
  riskCustomerCount: number;
  openTrainingCount: number;
  trackedAiOutputCount: number;
}

export type CopilotApiSuccess<T> = {
  ok: true;
  success: true;
  data: T;
};

export type CopilotApiError = {
  ok: false;
  success: false;
  code?: string;
  message?: string;
  error?: { code?: string; message?: string };
};
