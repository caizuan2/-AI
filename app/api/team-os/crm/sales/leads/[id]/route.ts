import { handleCrmLeadPatch } from "@/apps/team-os/features/crm/sales/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function PATCH(request: Request, { params }: { params: { id: string } }) {
  return handleCrmLeadPatch(request, params.id);
}
