import { runCronRoute } from "@/lib/jobs/api";
import { checkStaleKnowledgeTask } from "@/lib/jobs/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  return runCronRoute(request, "check-stale-knowledge", checkStaleKnowledgeTask);
}
