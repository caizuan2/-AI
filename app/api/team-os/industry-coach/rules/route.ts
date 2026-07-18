import {
  handleCoachRulesCreate,
  handleCoachRulesGet
} from "@/apps/team-os/features/industry-coach/services/industry-coach-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleCoachRulesGet(request);
}

export function POST(request: Request) {
  return handleCoachRulesCreate(request);
}
