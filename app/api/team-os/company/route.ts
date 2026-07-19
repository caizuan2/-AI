import { handleTenantCompanyGet } from "@/apps/team-os/features/tenant/services/tenant-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleTenantCompanyGet(request);
}
