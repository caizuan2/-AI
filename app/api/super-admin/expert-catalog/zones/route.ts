import {
  enforceSuperAdminApiAccess,
  superAdminError,
  superAdminSuccess
} from "@/app/api/super-admin/_shared";
import { writeAuditLog } from "@/lib/audit-log";
import { createExpertCatalogZone } from "@/lib/super-admin/services/expert-catalog.service";
import type { CreateExpertCatalogZoneInput } from "@/types/super-admin-expert-catalog";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await enforceSuperAdminApiAccess(request);
    const input = await request.json() as CreateExpertCatalogZoneInput;
    const zone = await createExpertCatalogZone(input);

    await writeAuditLog({
      userId: user.id,
      role: user.role,
      action: "expert_catalog.zone.create",
      targetType: "expert_catalog_zone",
      targetId: zone.zoneKey,
      request,
      metadata: {
        displayName: zone.displayName,
        status: zone.status
      }
    });

    return superAdminSuccess(zone);
  } catch (error) {
    return superAdminError(error);
  }
}
