import type { CapacitorConfig } from "@capacitor/cli";

const adminAppUrl =
  process.env.NEXT_PUBLIC_ADMIN_APP_URL ||
  "https://stately-sawine-1efd4d.netlify.app/login?app=admin&next=/ingest";

const config: CapacitorConfig = {
  appId: "com.aiknowledge.admin",
  appName: "AI知识库管理后台",
  webDir: "admin-app-shell",
  server: {
    url: adminAppUrl,
    cleartext: false
  }
};

export default config;
