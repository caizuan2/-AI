import { handleTeamOsRegister } from "@/apps/team-os/features/onboarding/services/onboarding-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleTeamOsRegister(request);
}
