import {
  handleCrmOpportunitiesGet,
  handleCrmOpportunityPost
} from "@/apps/team-os/features/crm/sales/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleCrmOpportunitiesGet(request);
}

export function POST(request: Request) {
  return handleCrmOpportunityPost(request);
}
