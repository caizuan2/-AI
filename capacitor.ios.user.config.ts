import type { CapacitorConfig } from "@capacitor/cli";

const userIosAppUrl =
  process.env.NEXT_PUBLIC_USER_IOS_APP_URL ||
  process.env.NEXT_PUBLIC_USER_APP_URL ||
  "https://stately-sawine-1efd4d.netlify.app/chat-ui";

const config: CapacitorConfig = {
  appId: "com.aiknowledge.chat",
  appName: "AI知识库助手",
  webDir: "app-shell",
  server: {
    url: userIosAppUrl,
    cleartext: false
  }
};

export default config;
