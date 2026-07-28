import type { CapacitorConfig } from "@capacitor/cli";

const rawAdminIngestAppUrl =
  process.env.ADMIN_INGEST_APP_URL
  || process.env.NEXT_PUBLIC_ADMIN_INGEST_IOS_APP_URL
  || "";

if (!rawAdminIngestAppUrl) {
  throw new Error(
    "ADMIN_INGEST_APP_URL is required for the admin-ingest iOS package."
  );
}

const adminIngestAppUrl = new URL(rawAdminIngestAppUrl);
if (
  adminIngestAppUrl.protocol !== "https:"
  || !adminIngestAppUrl.pathname.startsWith("/admin-ingest")
) {
  throw new Error(
    "ADMIN_INGEST_APP_URL must be an HTTPS /admin-ingest URL for iOS."
  );
}

adminIngestAppUrl.searchParams.set("app", "ingest-admin");
adminIngestAppUrl.searchParams.set("platform", "ios");

const config: CapacitorConfig = {
  appId: "com.aiknowledge.ingestadmin",
  appName: "小董AI",
  webDir: "admin-ingest-app-shell",
  server: {
    url: adminIngestAppUrl.toString(),
    cleartext: false
  },
  ios: {
    path: "ios-admin-ingest",
    appendUserAgent: " Admin-Ingest-iOS"
  }
};

export default config;
