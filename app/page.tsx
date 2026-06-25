import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getUserRoles } from "@/lib/auth/rbac";
import { getEntryPathForRole, getEntryRoleFromRoles } from "@/lib/auth/product";
import { UnauthorizedError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let user: Awaited<ReturnType<typeof getCurrentUser>>;

  try {
    user = await getCurrentUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/login");
    }

    throw error;
  }

  const roles = await getUserRoles(user);
  const entryRole = getEntryRoleFromRoles({
    roles,
    isSuperAdmin: roles.includes("super_admin")
  });

  redirect(getEntryPathForRole(entryRole, user.licenseActivated));
}
