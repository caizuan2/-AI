import {
  handleWorkflowCreatePost,
  handleWorkflowListGet
} from "@/apps/team-os/features/workflow/services/workflow-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleWorkflowListGet(request);
}

export async function POST(request: Request) {
  return handleWorkflowCreatePost(request);
}
