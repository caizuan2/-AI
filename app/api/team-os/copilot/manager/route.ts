import { handleCopilotDashboardGet } from "@/apps/team-os/features/copilot/services/copilot-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleCopilotDashboardGet(request, "MANAGER_ASSISTANT");
}
