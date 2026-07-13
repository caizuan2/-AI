import {
  handleCopilotInsightsGet,
  handleCopilotInsightsPost
} from "@/apps/team-os/features/copilot/services/copilot-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleCopilotInsightsGet(request);
}

export async function POST(request: Request) {
  return handleCopilotInsightsPost(request);
}
