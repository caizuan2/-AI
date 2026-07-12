import type { TeamRole } from "@/apps/team-os/types";

export const TRAINING_COURSE_CATEGORIES = [
  "PRODUCT",
  "SALES",
  "CUSTOMER_SERVICE",
  "MANAGEMENT",
  "OTHER"
] as const;
export const TRAINING_COURSE_LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;
export const TRAINING_COURSE_STATUSES = ["ACTIVE", "DISABLED"] as const;
export const TRAINING_RECORD_STATUSES = ["STARTED", "COMPLETED", "FAILED"] as const;
export const TRAINING_ASSIGNMENT_STATUSES = [
  "ASSIGNED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED"
] as const;

export type TrainingCourseCategory = (typeof TRAINING_COURSE_CATEGORIES)[number];
export type TrainingCourseLevel = (typeof TRAINING_COURSE_LEVELS)[number];
export type TrainingCourseStatus = (typeof TRAINING_COURSE_STATUSES)[number];
export type TrainingRecordStatus = (typeof TRAINING_RECORD_STATUSES)[number];
export type TrainingAssignmentStatus = (typeof TRAINING_ASSIGNMENT_STATUSES)[number];

export interface TrainingCompanyOption {
  id: string;
  name: string;
}

export interface TrainingTeamOption {
  id: string;
  companyId: string;
  name: string;
  role: TeamRole;
}

export interface TrainingMemberOption {
  id: string;
  name: string;
  teamId: string;
  teamName: string;
  role: TeamRole;
}

export interface TrainingPermissions {
  canCreateCourse: boolean;
  canEditCourse: boolean;
  canAssignTraining: boolean;
  canViewTeamProgress: boolean;
  canLearn: boolean;
  canSimulate: boolean;
}

export interface TrainingContext {
  companyId: string;
  companyName: string;
  companies: TrainingCompanyOption[];
  teams: TrainingTeamOption[];
  currentRoles: TeamRole[];
  permissions: TrainingPermissions;
}

export interface TrainingCourseRecord {
  id: string;
  companyId: string;
  title: string;
  description: string;
  category: TrainingCourseCategory;
  content: string;
  level: TrainingCourseLevel;
  status: TrainingCourseStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingRecordItem {
  id: string;
  courseId: string;
  userId: string;
  score: number;
  status: TrainingRecordStatus;
  completedAt?: string;
  createdAt: string;
}

export interface TrainingAssignmentItem {
  id: string;
  courseId: string;
  courseTitle: string;
  teamId: string;
  teamName: string;
  userId: string;
  userName: string;
  assignedBy: string;
  assignedByName: string;
  deadline: string;
  status: TrainingAssignmentStatus;
  overdue: boolean;
  createdAt: string;
}

export interface TrainingEvaluationItem {
  id: string;
  userId: string;
  courseId: string;
  question: string;
  answer: string;
  score: number;
  feedback: string;
  createdAt: string;
}

export interface TrainingCourseProgressItem {
  course: TrainingCourseRecord;
  assignment?: TrainingAssignmentItem;
  record?: TrainingRecordItem;
  latestEvaluation?: TrainingEvaluationItem;
}

export interface TrainingDashboardStats {
  assignedCourses: number;
  startedCourses: number;
  completedCourses: number;
  averageScore: number;
  growthScore: number;
}

export interface TrainingDashboardData {
  context: TrainingContext;
  myCourses: TrainingCourseProgressItem[];
  records: TrainingRecordItem[];
  stats: TrainingDashboardStats;
  truncated: boolean;
}

export interface TrainingCourseListFilters {
  companyId?: string;
  search?: string;
  category?: TrainingCourseCategory;
  level?: TrainingCourseLevel;
  status?: TrainingCourseStatus;
}

export interface TrainingCourseListData {
  context: TrainingContext;
  items: TrainingCourseRecord[];
  total: number;
  truncated: boolean;
}

export interface UpsertTrainingCourseInput {
  companyId: string;
  courseId?: string;
  title: string;
  description?: string;
  category: TrainingCourseCategory;
  content?: string;
  level: TrainingCourseLevel;
  status: TrainingCourseStatus;
  generateFromKnowledge: boolean;
}

export interface UpdateTrainingRecordInput {
  courseId: string;
  action: "START";
}

export interface CreateTrainingAssignmentInput {
  courseId: string;
  teamId: string;
  userId: string;
  deadline: string;
}

export interface TrainingManagementData {
  context: TrainingContext;
  members: TrainingMemberOption[];
  courses: TrainingCourseRecord[];
  assignments: TrainingAssignmentItem[];
  truncated: boolean;
  progress: Array<{
    userId: string;
    userName: string;
    teamId: string;
    teamName: string;
    assigned: number;
    completed: number;
    averageScore: number;
  }>;
}

export interface TrainingSimulationData {
  courseId: string;
  courseTitle: string;
  question: string;
  scenarioToken: string;
}

export interface EvaluateTrainingInput {
  courseId: string;
  question: string;
  answer: string;
  scenarioToken: string;
}

export interface TrainingEvaluationResult {
  evaluation: TrainingEvaluationItem;
  record: TrainingRecordItem;
  score: number;
  feedback: string;
  suggestions: string[];
}

export interface TrainingRecommendationItem {
  courseId?: string;
  title: string;
  reason: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  focusAreas: string[];
}

export interface TrainingRecommendationData {
  context: TrainingContext;
  summary: string;
  recommendations: TrainingRecommendationItem[];
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
  error?: { code?: string; message?: string };
}
