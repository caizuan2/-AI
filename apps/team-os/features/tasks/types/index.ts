export const TASK_STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export const TASK_SUBMISSION_STATUSES = ["SUBMITTED", "REVIEWING", "ANALYZED"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskSubmissionStatus = (typeof TASK_SUBMISSION_STATUSES)[number];
export type TaskListScope = "management" | "my";

export interface TeamOption {
  id: string;
  name: string;
  role: "TEAM_OWNER" | "TEAM_MANAGER" | "TRAINER" | "TEAM_MEMBER";
  canManage: boolean;
}

export interface TaskListItem {
  id: string;
  title: string;
  description: string;
  creatorId: string;
  teamId: string;
  teamName: string;
  deadline: string;
  targetCount: number;
  completedCount: number;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TaskListData {
  tasks: TaskListItem[];
  teams: TeamOption[];
}

export interface CreateTaskInput {
  title: string;
  description: string;
  teamId: string;
  deadline: string;
  targetCount: number;
  submissionRequirements: string;
}

export interface SubmitTaskInput {
  content: string;
  images: string[];
  attachments: string[];
  summary: string;
}

export interface TaskSubmissionRecord extends SubmitTaskInput {
  id: string;
  taskId: string;
  userId: string;
  status: TaskSubmissionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TaskSubmissionAnalysis {
  score: number;
  problems: string[];
  suggestions: string[];
}

export interface ApiSuccessEnvelope<T> {
  ok: true;
  success: true;
  data: T;
}

export interface ApiErrorEnvelope {
  ok?: false;
  success: false;
  message?: string;
  error?: { message?: string };
}
