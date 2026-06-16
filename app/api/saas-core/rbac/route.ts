import { getRoleMatrix } from "@/lib/saas-core/rbac.service";
import { saasCoreError, saasCoreSuccess } from "@/app/api/saas-core/_shared";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return saasCoreSuccess(getRoleMatrix());
  } catch (error) {
    return saasCoreError(error);
  }
}
