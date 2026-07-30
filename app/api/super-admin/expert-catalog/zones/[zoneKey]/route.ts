import {
  enforceSuperAdminApiAccess,
  superAdminError,
  superAdminSuccess
} from "@/app/api/super-admin/_shared";
import { writeAuditLog } from "@/lib/audit-log";
import { updateExpertCatalogZone } from "@/lib/super-admin/services/expert-catalog.service";
import type { UpdateExpertCatalogZoneInput } from "@/types/super-admin-expert-catalog";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    zoneKey: string;
  };
};

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const user = await enforceSuperAdminApiAccess(request);
    const input = await request.json() as UpdateExpertCatalogZoneInput;
    const zone = await updateExpertCatalogZone(params.zoneKey, input);

    await writeAuditLog({
      userId: user.id,
      role: user.role,
      action: "expert_catalog.zone.update",
      targetType: "expert_catalog_zone",
      targetId: zone.zoneKey,
      request,
      metadata: {
        displayName: zone.displayName,
        status: zone.status,
        sortOrder: zone.sortOrder
      }
    });

    return superAdminSuccess(zone);
  } catch (error) {
    return superAdminError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const user = await enforceSuperAdminApiAccess(request);
    const zone = await updateExpertCatalogZone(params.zoneKey, {
      status: "archived"
    });

    await writeAuditLog({
      userId: user.id,
      role: user.role,
      action: "expert_catalog.zone.archive",
      targetType: "expert_catalog_zone",
      targetId: zone.zoneKey,
      request,
      metadata: {
        displayName: zone.displayName
      }
    });

    return superAdminSuccess(zone);
  } catch (error) {
    return superAdminError(error);
  }
}
