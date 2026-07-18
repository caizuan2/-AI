import {
  handleIntegrationsGet,
  handleIntegrationsPost
} from "@/apps/team-os/features/notification/services/notification-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleIntegrationsGet(request);
}

export async function POST(request: Request) {
  return handleIntegrationsPost(request);
}
