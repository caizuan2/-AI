import { handleCrmContractStatusPatch } from "@/apps/team-os/features/crm/sales/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function PATCH(request: Request, { params }: { params: { id: string } }) {
  return handleCrmContractStatusPatch(request, params.id);
}
