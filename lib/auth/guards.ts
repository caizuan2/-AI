import "server-only";

import { requireUser } from "@/lib/auth";
import { checkUserLicense } from "@/lib/auth/license";
export { requireAuth, requireKbAdmin, requireRole, requireSuperAdmin } from "@/lib/auth/rbac";

export async function requireLicensedUser() {
  const user = await requireUser();

  await checkUserLicense(user.id);

  return user;
}
