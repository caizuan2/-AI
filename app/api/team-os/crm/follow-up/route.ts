import { handleCrmFollowUpCreate } from "@/apps/team-os/features/crm/services/crm-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleCrmFollowUpCreate(request);
}
