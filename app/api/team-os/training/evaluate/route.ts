import { handleTrainingEvaluate } from "@/apps/team-os/features/training/services/training-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleTrainingEvaluate(request);
}
