import { handleTenantSubscriptionUpgradePost } from "@/apps/team-os/features/tenant/services/tenant-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleTenantSubscriptionUpgradePost(request);
}
