import { handleTaskCreate, handleTaskList } from "@/apps/team-os/features/tasks/services/task-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleTaskList(request);
}

export function POST(request: Request) {
  return handleTaskCreate(request);
}
