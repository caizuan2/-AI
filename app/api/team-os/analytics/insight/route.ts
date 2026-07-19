import { handleBusinessInsightPost } from "@/apps/team-os/features/analytics/services/analytics-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleBusinessInsightPost(request);
}
