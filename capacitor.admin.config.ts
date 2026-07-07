import type { CapacitorConfig } from "@capacitor/cli";

const adminAppUrl =
  process.env.NEXT_PUBLIC_ADMIN_APP_URL ||
  "http://47.238.0.23/admin-ingest?app=ingest-admin&platform=apk";

const config: CapacitorConfig = {
  appId: "com.aiknowledge.admin",
  appName: "小董AI",
  webDir: "admin-app-shell",
  server: {
    url: adminAppUrl,
    cleartext: true
  }
};

export default config;
