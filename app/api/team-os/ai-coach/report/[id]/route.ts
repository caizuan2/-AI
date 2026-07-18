import { handleCoachReportGet } from "@/apps/team-os/features/ai-coach/services/ai-coach-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request, { params }: { params: { id: string } }) {
  return handleCoachReportGet(request, params.id);
}
