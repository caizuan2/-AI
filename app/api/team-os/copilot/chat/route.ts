import { handleCopilotChatPost } from "@/apps/team-os/features/copilot/services/copilot-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleCopilotChatPost(request);
}
