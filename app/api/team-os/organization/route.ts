import {
  handleOrganizationCreate,
  handleOrganizationGet,
  handleOrganizationUpdate
} from "@/apps/team-os/features/organization/services/organization-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleOrganizationGet(request);
}

export function POST(request: Request) {
  return handleOrganizationCreate(request);
}

export function PATCH(request: Request) {
  return handleOrganizationUpdate(request);
}
