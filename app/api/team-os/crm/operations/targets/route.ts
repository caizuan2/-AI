import {
  handleCrmTargetCreate,
  handleCrmTargetsGet
} from "@/apps/team-os/features/crm/operations/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handleCrmTargetsGet;
export const POST = handleCrmTargetCreate;
