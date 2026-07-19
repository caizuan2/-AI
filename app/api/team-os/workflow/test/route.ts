import { handleWorkflowTestPost } from "@/apps/team-os/features/workflow/services/workflow-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleWorkflowTestPost(request);
}
