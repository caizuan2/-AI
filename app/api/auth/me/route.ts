import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { getUserRoles } from "@/lib/auth/rbac";

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
  };
}

export async function GET() {
  try {
    const user = await requireUser();
    const roles = await getUserRoles(user);
    const isSuperAdmin = roles.includes("super_admin");

    return apiSuccess<MeResponse>({
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        name: user.name,
        avatar_url: null,
        licenseActivated: user.licenseActivated || isSuperAdmin,
        isSuperAdmin
      }
    });
  } catch (error) {
    return apiError(error);
  }
}
