import {
  handleCoachAnalysisOptions,
  handleCoachAnalyze
} from "@/apps/team-os/features/ai-coach/services/ai-coach-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleCoachAnalysisOptions(request);
}

export function POST(request: Request) {
  return handleCoachAnalyze(request);
}
