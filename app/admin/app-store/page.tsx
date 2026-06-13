import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { AppStoreConsole } from "@/app/admin/app-store/app-store-console";
import { normalizeAppStoreManifest } from "@/lib/app-store";
import { requireAdminUser } from "@/lib/admin";
import { ForbiddenError, LicenseRequiredError, UnauthorizedError } from "@/lib/errors";
import releaseInfo from "../../../public/releases/latest.json";

export const dynamic = "force-dynamic";

export default async function AdminAppStorePage() {
  try {
    await requireAdminUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/login?redirectTo=/admin/app-store");
    }

    if (error instanceof ForbiddenError) {
      redirect("/knowledge");
    }

    if (error instanceof LicenseRequiredError) {
      redirect("/unlock");
    }

    throw error;
  }

  const manifest = normalizeAppStoreManifest(releaseInfo);

  if (!manifest) {
    throw new Error("Invalid app store release manifest.");
  }

  return (
    <main className="min-h-dvh bg-canvas px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader
          eyebrow="App Store"
          title="发布中心"
          description="多应用、多版本、灰度、强制更新和回滚控制台。"
        />
        <AppStoreConsole initialManifest={manifest} />
      </div>
    </main>
  );
}
