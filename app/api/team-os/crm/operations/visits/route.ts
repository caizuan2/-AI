import {
  handleCrmVisitCreate,
  handleCrmVisitsGet,
  handleCrmVisitStatusUpdate
} from "@/apps/team-os/features/crm/operations/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handleCrmVisitsGet;
export const POST = handleCrmVisitCreate;
export const PATCH = handleCrmVisitStatusUpdate;
