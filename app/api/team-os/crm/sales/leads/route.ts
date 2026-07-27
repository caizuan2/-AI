import {
  handleCrmLeadPost,
  handleCrmLeadsGet
} from "@/apps/team-os/features/crm/sales/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleCrmLeadsGet(request);
}

export function POST(request: Request) {
  return handleCrmLeadPost(request);
}
