import { redirect } from "next/navigation";
import { AdminAnalyticsDashboard } from "@/app/admin/analytics/analytics-dashboard";
import { requireAdminUser } from "@/lib/admin";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
  try {
    await requireAdminUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/login?redirectTo=/admin/analytics");
    }

    if (error instanceof ForbiddenError) {
      redirect("/knowledge");
    }

    throw error;
  }

  return (
    <main className="min-h-dvh bg-canvas px-4 py-6 sm:px-6 lg:px-8">
      <AdminAnalyticsDashboard />
    </main>
  );
}
