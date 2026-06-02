import { redirect } from "next/navigation";
import { LicenseAdminPanel } from "@/app/admin/licenses/license-admin-panel";
import { requireAdminUser } from "@/lib/admin";
import { ForbiddenError, LicenseRequiredError, UnauthorizedError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export default async function AdminLicensesPage() {
  try {
    await requireAdminUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/login?redirectTo=/admin/licenses");
    }

    if (error instanceof LicenseRequiredError) {
      redirect("/unlock");
    }

    if (error instanceof ForbiddenError) {
      redirect("/knowledge");
    }

    throw error;
  }

  return (
    <main className="min-h-dvh bg-canvas px-4 py-6 sm:px-6 lg:px-8">
      <LicenseAdminPanel />
    </main>
  );
}
