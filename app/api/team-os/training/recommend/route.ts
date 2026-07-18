import { handleTrainingRecommendGet } from "@/apps/team-os/features/training/services/training-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleTrainingRecommendGet(request);
}
