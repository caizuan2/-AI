import { handleTaskSubmit } from "@/apps/team-os/features/tasks/services/task-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request, { params }: { params: { id: string } }) {
  return handleTaskSubmit(request, params.id);
}
