import { changeUserRole } from "@/lib/saas-core/rbac.service";
import { saasCoreError, saasCoreSuccess } from "@/app/api/saas-core/_shared";
import type { SaaSUser } from "@/types/saas-core";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json() as { role?: SaaSUser["role"] };

    if (!body.role) {
      throw new Error("role is required.");
    }

    return saasCoreSuccess(await changeUserRole(params.id, body.role));
  } catch (error) {
    return saasCoreError(error);
  }
}
