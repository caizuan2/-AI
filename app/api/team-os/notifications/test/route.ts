import { handleNotificationTestPost } from "@/apps/team-os/features/notification/services/notification-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleNotificationTestPost(request);
}
