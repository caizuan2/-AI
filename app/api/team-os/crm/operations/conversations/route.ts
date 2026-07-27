import {
  handleCrmConversationCreate,
  handleCrmConversationsGet
} from "@/apps/team-os/features/crm/operations/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handleCrmConversationsGet;
export const POST = handleCrmConversationCreate;
