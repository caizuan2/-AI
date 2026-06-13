import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { requireAdminUser } from "@/lib/admin";
import { ForbiddenError, LicenseRequiredError, UnauthorizedError } from "@/lib/errors";
import { ReleaseConsoleClient, type ReleaseConsoleInitialData } from "./release-console-client";

export const dynamic = "force-dynamic";

const REPO = "caizuan2/-AI";
const API_BASE = `https://api.github.com/repos/${REPO}`;
const LATEST_JSON_URL = `https://raw.githubusercontent.com/${REPO}/main/public/releases/latest.json`;

function getInitialData(): ReleaseConsoleInitialData {
  return {
    repo: REPO,
    apiBase: API_BASE,
    latestJsonUrl: LATEST_JSON_URL,
    fetchedAt: new Date().toISOString(),
    runs: [],
    releases: [],
    latestJson: null
  };
}

export default async function AdminReleaseConsolePage() {
  try {
    await requireAdminUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/login?redirectTo=/admin/release-console");
    }

    if (error instanceof ForbiddenError) {
      redirect("/knowledge");
    }

    if (error instanceof LicenseRequiredError) {
      redirect("/unlock");
    }

    throw error;
  }

  const initialData = getInitialData();

  return (
    <main className="min-h-dvh bg-canvas px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader
          eyebrow="CI/CD"
          title="发布控制台"
          description="GitHub Actions、APK、EXE、Web 部署、版本回滚和灰度发布控制。"
        />
        <ReleaseConsoleClient initialData={initialData} />
      </div>
    </main>
  );
}
