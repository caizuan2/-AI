import { redirect } from "next/navigation";
import { SaasLicensePanel } from "@/app/admin/saas-licenses/saas-license-panel";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export default async function AdminSaasLicensesPage() {
  try {
    await requireSuperAdmin(undefined, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "saas_license"
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/login?redirectTo=/admin/saas-licenses");
    }

    if (error instanceof ForbiddenError) {
      redirect("/knowledge");
    }

    throw error;
  }

  return (
    <main className="min-h-dvh bg-canvas px-4 py-6 sm:px-6 lg:px-8">
      <SaasLicensePanel />
    </main>
  );
}
