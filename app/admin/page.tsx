import { redirect } from "next/navigation";
import { AdminDashboard } from "@/app/admin/admin-dashboard";
import { requireAdminUser } from "@/lib/admin";
import { ForbiddenError, LicenseRequiredError, UnauthorizedError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  try {
    await requireAdminUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/login?redirectTo=/admin");
    }

    if (error instanceof ForbiddenError) {
      redirect("/knowledge");
    }

    if (error instanceof LicenseRequiredError) {
      redirect("/unlock");
    }

    throw error;
  }

  return (
    <main className="min-h-dvh bg-canvas px-4 py-6 sm:px-6 lg:px-8">
      <AdminDashboard />
    </main>
  );
}
