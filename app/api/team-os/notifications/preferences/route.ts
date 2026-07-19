import {
  handleNotificationPreferencesGet,
  handleNotificationPreferencesPut
} from "@/apps/team-os/features/notification/services/notification-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleNotificationPreferencesGet(request);
}

export async function PUT(request: Request) {
  return handleNotificationPreferencesPut(request);
}
