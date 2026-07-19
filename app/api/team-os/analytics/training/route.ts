import { handleTrainingAnalyticsGet } from "@/apps/team-os/features/analytics/services/analytics-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleTrainingAnalyticsGet(request);
}
