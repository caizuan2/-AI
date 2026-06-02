import { runCronRoute } from "@/lib/jobs/api";
import { refreshLowQualitySuggestionsTask } from "@/lib/jobs/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  return runCronRoute(request, "refresh-low-quality-suggestions", () => refreshLowQualitySuggestionsTask(5));
}
