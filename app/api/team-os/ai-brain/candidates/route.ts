import { handleAiBrainCandidatesGet } from "@/apps/team-os/features/ai-brain/services/ai-brain-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleAiBrainCandidatesGet(request);
}
