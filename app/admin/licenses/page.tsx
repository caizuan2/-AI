import { LicenseAdminPanel } from "@/app/admin/licenses/license-admin-panel";

export const dynamic = "force-dynamic";

export default async function AdminLicensesPage() {
  return (
    <main className="min-h-dvh bg-canvas px-4 py-6 sm:px-6 lg:px-8">
      <LicenseAdminPanel />
    </main>
  );
}
