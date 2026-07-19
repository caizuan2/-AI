import { handleWorkflowExecutionsGet } from "@/apps/team-os/features/workflow/services/workflow-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleWorkflowExecutionsGet(request);
}
