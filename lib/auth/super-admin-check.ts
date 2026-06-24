import "server-only";

import { redirect } from "next/navigation";
import { requireSuperAdminAccess as requireSuperAdminGuard } from "@/lib/auth/guards";
import { UnauthorizedError } from "@/lib/errors";

export async function requireSuperAdminAccess(request?: Request) {
  return requireSuperAdminGuard(request);
}

export async function enforceSuperAdminPageAccess() {
  try {
    return await requireSuperAdminAccess();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/login?next=/super-admin");
    }

    redirect("/no-access");
  }
}
