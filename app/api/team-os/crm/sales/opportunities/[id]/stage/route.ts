import { handleCrmOpportunityStagePost } from "@/apps/team-os/features/crm/sales/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request, { params }: { params: { id: string } }) {
  return handleCrmOpportunityStagePost(request, params.id);
}
