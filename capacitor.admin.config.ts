import type { CapacitorConfig } from "@capacitor/cli";
import adminRelease from "./config/admin-ingest/release.json";

const configuredAdminAppUrl =
  process.env.NEXT_PUBLIC_ADMIN_APP_URL ||
  adminRelease.web_url;
const adminAppUrl = new URL(configuredAdminAppUrl);

adminAppUrl.searchParams.set("app", "ingest-admin");
adminAppUrl.searchParams.set("platform", "apk");
adminAppUrl.searchParams.set(
  "shellVersion",
  process.env.ADMIN_INGEST_APP_VERSION || adminRelease.version
);
adminAppUrl.searchParams.set(
  "shellBuild",
  process.env.ADMIN_INGEST_APP_BUILD || String(adminRelease.build)
);
const shellWebReleaseSha = process.env.ADMIN_WEB_RELEASE_SHA || "";
if (shellWebReleaseSha) {
  adminAppUrl.searchParams.set("shellWebReleaseSha", shellWebReleaseSha);
}

const config: CapacitorConfig = {
  appId: "com.aiknowledge.admin",
  appName: "小董AI",
  webDir: "admin-app-shell",
  plugins: {
    SystemBars: {
      insetsHandling: "css"
    }
  },
  server: {
    url: adminAppUrl.toString(),
    cleartext: true
  }
};

export default config;
