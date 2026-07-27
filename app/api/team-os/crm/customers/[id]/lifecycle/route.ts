import {
  handleCrmCustomerLifecycleGet,
  handleCrmCustomerLifecyclePatch
} from "@/apps/team-os/features/crm/services/crm-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request, { params }: { params: { id: string } }) {
  return handleCrmCustomerLifecycleGet(request, params.id);
}

export function PATCH(request: Request, { params }: { params: { id: string } }) {
  return handleCrmCustomerLifecyclePatch(request, params.id);
}
