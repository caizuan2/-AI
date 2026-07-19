import {
  handleTeamOsInvitationAccept,
  handleTeamOsInvitationGet
} from "@/apps/team-os/features/onboarding/services/onboarding-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(_request: Request, { params }: { params: { code: string } }) {
  return handleTeamOsInvitationGet(params.code);
}

export function POST(request: Request, { params }: { params: { code: string } }) {
  return handleTeamOsInvitationAccept(request, params.code);
}
