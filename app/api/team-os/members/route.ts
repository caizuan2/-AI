import { handleMembersCreate, handleMembersGet } from "@/apps/team-os/features/organization/services/organization-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleMembersGet(request);
}

export function POST(request: Request) {
  return handleMembersCreate(request);
}
