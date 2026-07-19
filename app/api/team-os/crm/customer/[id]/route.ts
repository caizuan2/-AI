import { handleCrmCustomerDetailGet } from "@/apps/team-os/features/crm/services/crm-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request, context: { params: { id: string } }) {
  return handleCrmCustomerDetailGet(request, context.params.id);
}
