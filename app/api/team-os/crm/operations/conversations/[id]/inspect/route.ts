import { handleCrmConversationInspect } from "@/apps/team-os/features/crm/operations/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request, context: { params: { id: string } }) {
  return handleCrmConversationInspect(request, context.params.id);
}
