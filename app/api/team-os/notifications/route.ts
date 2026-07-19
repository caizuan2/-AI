import { handleNotificationsGet } from "@/apps/team-os/features/notification/services/notification-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleNotificationsGet(request);
}
