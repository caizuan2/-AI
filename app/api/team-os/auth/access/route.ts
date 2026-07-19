import { handleTeamOsAccessGet } from "@/apps/team-os/features/auth/services/team-os-access-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleTeamOsAccessGet(request);
}
