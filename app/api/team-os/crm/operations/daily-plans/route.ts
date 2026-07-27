import {
  handleCrmDailyPlanUpsert,
  handleCrmDailyPlansGet
} from "@/apps/team-os/features/crm/operations/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handleCrmDailyPlansGet;
export const POST = handleCrmDailyPlanUpsert;
