export const COACH_PROVIDER_NAMES = ["qwen", "openai", "deepseek"] as const;

export type CoachProviderName = (typeof COACH_PROVIDER_NAMES)[number];

export type CoachTeamRole =
  | "TEAM_OWNER"
  | "TEAM_MANAGER"
  | "TRAINER"
  | "TEAM_MEMBER";

export type CoachSubmissionStatus = "SUBMITTED" | "REVIEWING" | "ANALYZED";

export type CoachSkillKey =
  | "ice_breaking"
  | "needs_discovery"
  | "product_presentation"
  | "objection_handling"
  | "closing_progress";

export interface CoachProviderOption {
  id: CoachProviderName;
  label: string;
}

export interface CoachTeamOption {
  id: string;
  name: string;
  companyId: string;
  companyName?: string;
  role: CoachTeamRole;
  canViewTeam: boolean;
}

export interface CoachSubmissionOption {
  id: string;
  teamId: string;
  taskTitle: string;
  createdAt: string;
  status: CoachSubmissionStatus;
  analyzed: boolean;
  reportId?: string;
}

export interface CoachAnalysisOptions {
  employee: {
    id: string;
    name: string;
  };
  teams: CoachTeamOption[];
  submissions: CoachSubmissionOption[];
  providers: CoachProviderOption[];
}

export interface CoachSkillScore {
  key: CoachSkillKey;
  label: string;
  score: number;
  maxScore: 20;
  level: string;
}

export interface CoachMatchedStandard {
  standardId: string;
  category: string;
  title: string;
  version: number;
  evidence: string;
  gap: string;
}

export interface CoachReport {
  id: string;
  userId: string;
  employeeName: string;
  teamId: string;
  teamName: string;
  submissionId?: string;
  score: number;
  industryScore?: number;
  summary: string;
  problems: string[];
  suggestions: string[];
  trainingPlan: string;
  matchedStandards: CoachMatchedStandard[];
  coachFeedback?: string;
  improvementPlan?: string;
  skills: CoachSkillScore[];
  createdAt: string;
  updatedAt: string;
}

export interface AnalyzeConversationInput {
  conversation: string;
  screenshotUrls: string[];
  employeeId?: string;
  teamId: string;
  submissionId?: string;
  provider?: CoachProviderName;
}

export interface CoachAnalysisResult {
  score: number;
  industryScore: number;
  summary: string;
  problems: string[];
  suggestions: string[];
  trainingPlan: string;
  matchedStandards: CoachMatchedStandard[];
  coachFeedback: string;
  improvementPlan: string;
  skills: CoachSkillScore[];
}

export interface CoachRankingItem {
  rank: number;
  userId: string;
  employeeName: string;
  score: number;
  reportId: string;
}

export interface CoachProblemStat {
  problem: string;
  count: number;
}

export interface CoachTeamMemberSummary {
  userId: string;
  employeeName: string;
  teamId: string;
  teamName: string;
  reportId?: string;
  score?: number;
  mainProblem?: string;
  trainingPlan?: string;
  analyzedAt?: string;
}

export interface CoachDashboardData {
  date: string;
  selectedTeamId: string | null;
  teams: CoachTeamOption[];
  canViewTeam: boolean;
  currentUserReport?: CoachReport;
  analyzedCount: number;
  averageScore: number;
  rankings: CoachRankingItem[];
  problemStats: CoachProblemStat[];
  members: CoachTeamMemberSummary[];
}

export type CoachApiSuccess<T> = {
  ok: true;
  success: true;
  data: T;
};

export type CoachApiError = {
  ok: false;
  success: false;
  code: string;
  message: string;
  requestId?: string;
  error: {
    code: string;
    message: string;
    requestId?: string;
  };
};

export type CoachApiResponse<T> = CoachApiSuccess<T> | CoachApiError;
