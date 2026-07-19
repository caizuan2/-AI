import type {
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
  CreateTaskInput,
  SubmitTaskInput,
  TaskListData,
  TaskListItem,
  TaskListScope
} from "@/apps/team-os/features/tasks/types";

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json() as ApiSuccessEnvelope<T> | ApiErrorEnvelope;

  if (!body.success) {
    throw new Error(body.message || body.error?.message || "请求失败，请稍后重试。");
  }

  if (!response.ok || !("data" in body)) {
    throw new Error("接口返回格式不正确。");
  }

  return body.data;
}

export async function fetchTasks(scope: TaskListScope): Promise<TaskListData> {
  const response = await fetch(`/api/team-os/tasks?scope=${scope}`, {
    cache: "no-store"
  });
  return readResponse<TaskListData>(response);
}

export async function createTask(input: CreateTaskInput): Promise<TaskListItem> {
  const response = await fetch("/api/team-os/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const data = await readResponse<{ task: TaskListItem }>(response);
  return data.task;
}

export async function submitTask(taskId: string, input: SubmitTaskInput): Promise<string> {
  const response = await fetch(`/api/team-os/tasks/${encodeURIComponent(taskId)}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const body = await response.json() as (ApiErrorEnvelope & { submissionId?: string }) | {
    success: true;
    submissionId: string;
  };

  if (!response.ok || !body.success || !("submissionId" in body) || !body.submissionId) {
    throw new Error("message" in body ? body.message || body.error?.message || "提交失败，请稍后重试。" : "提交失败，请稍后重试。");
  }

  return body.submissionId;
}
