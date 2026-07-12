import type {
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
  CreateTrainingAssignmentInput,
  EvaluateTrainingInput,
  TrainingAssignmentItem,
  TrainingCourseListData,
  TrainingCourseListFilters,
  TrainingCourseRecord,
  TrainingDashboardData,
  TrainingEvaluationResult,
  TrainingManagementData,
  TrainingRecommendationData,
  TrainingRecordItem,
  TrainingSimulationData,
  UpsertTrainingCourseInput
} from "@/apps/team-os/features/training/types";

export class TrainingClientError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "TrainingClientError";
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  let parsed: unknown;
  try {
    parsed = await response.json() as unknown;
  } catch {
    throw new TrainingClientError("接口返回格式不正确，请稍后重试。");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TrainingClientError("接口返回格式不正确，请稍后重试。");
  }
  const body = parsed as ApiSuccessEnvelope<T> | ApiErrorEnvelope;
  if (!response.ok || body.success !== true || !("data" in body)) {
    const errorBody = body as ApiErrorEnvelope;
    throw new TrainingClientError(
      errorBody.message || errorBody.error?.message || "请求失败，请稍后重试。",
      errorBody.code || errorBody.error?.code
    );
  }
  return body.data;
}

function companyQuery(companyId?: string) {
  return companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
}

function courseQuery(filters: TrainingCourseListFilters) {
  const query = new URLSearchParams();
  if (filters.companyId) query.set("companyId", filters.companyId);
  if (filters.search?.trim()) query.set("q", filters.search.trim());
  if (filters.category) query.set("category", filters.category);
  if (filters.level) query.set("level", filters.level);
  if (filters.status) query.set("status", filters.status);
  const value = query.toString();
  return value ? `?${value}` : "";
}

export async function fetchTrainingCourses(filters: TrainingCourseListFilters = {}) {
  return readResponse<TrainingCourseListData>(await fetch(
    `/api/team-os/training/courses${courseQuery(filters)}`,
    { cache: "no-store" }
  ));
}

export async function saveTrainingCourse(input: UpsertTrainingCourseInput) {
  const data = await readResponse<{ course: TrainingCourseRecord }>(await fetch("/api/team-os/training/courses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }));
  return data.course;
}

export async function fetchTrainingDashboard(companyId?: string) {
  return readResponse<TrainingDashboardData>(await fetch(
    `/api/team-os/training/records${companyQuery(companyId)}`,
    { cache: "no-store" }
  ));
}

export async function startTrainingCourse(courseId: string) {
  const data = await readResponse<{ record: TrainingRecordItem }>(await fetch("/api/team-os/training/records", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ courseId, action: "START" })
  }));
  return data.record;
}

export async function fetchTrainingManagement(companyId?: string) {
  return readResponse<TrainingManagementData>(await fetch(
    `/api/team-os/training/assignments${companyQuery(companyId)}`,
    { cache: "no-store" }
  ));
}

export async function createTrainingAssignment(input: CreateTrainingAssignmentInput) {
  const data = await readResponse<{ assignment: TrainingAssignmentItem }>(await fetch("/api/team-os/training/assignments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }));
  return data.assignment;
}

export async function generateTrainingSimulation(courseId: string) {
  return readResponse<TrainingSimulationData>(await fetch("/api/team-os/training/simulation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ courseId })
  }));
}

export async function submitTrainingEvaluation(input: EvaluateTrainingInput) {
  return readResponse<TrainingEvaluationResult>(await fetch("/api/team-os/training/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }));
}

export async function fetchTrainingRecommendations(companyId?: string) {
  return readResponse<TrainingRecommendationData>(await fetch(
    `/api/team-os/training/recommend${companyQuery(companyId)}`,
    { cache: "no-store" }
  ));
}
