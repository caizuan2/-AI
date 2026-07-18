import { handleInvitationCreate } from "@/apps/team-os/features/organization/services/organization-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleInvitationCreate(request);
}
