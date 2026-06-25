import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { getUserRoles } from "@/lib/auth/rbac";
import { getEntryPathFromRoles, getEntryRoleFromRoles, type EntryRole } from "@/lib/auth/product";

export const dynamic = "force-dynamic";

interface MeResponse {
  user: {
    id: string;
    phone: string;
    email: string | null;
    name: string;
    avatar_url: null;
    licenseActivated: boolean;
    isSuperAdmin: boolean;
    role: EntryRole;
    roles: string[];
    entryPath: string;
  };
}

export async function GET() {
  try {
    const user = await requireUser();
    const roles = await getUserRoles(user);
    const isSuperAdmin = roles.includes("super_admin");
    const licenseActivated = user.licenseActivated || isSuperAdmin;
    const role = getEntryRoleFromRoles({ roles, isSuperAdmin });

    return apiSuccess<MeResponse>({
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        name: user.name,
        avatar_url: null,
        licenseActivated,
        isSuperAdmin,
        role,
        roles,
        entryPath: getEntryPathFromRoles({ roles, isSuperAdmin, licenseActivated })
      }
    });
  } catch (error) {
    return apiError(error);
  }
}
