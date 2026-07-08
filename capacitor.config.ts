import type { CapacitorConfig } from "@capacitor/cli";
import versionInfo from "./version.json";

function withShellVersionParams(url: string): string {
  try {
    const parsed = new URL(url);

    parsed.searchParams.set("shellVersion", versionInfo.version);
    parsed.searchParams.set("shellBuild", String(versionInfo.build));

    return parsed.toString();
  } catch {
    return url;
  }
}

const userAppUrl = withShellVersionParams(
  process.env.NEXT_PUBLIC_USER_APP_URL ||
  "http://47.238.0.23/app/chat"
);

const config: CapacitorConfig = {
  appId: "com.aiknowledge.chat",
  appName: "小董AI",
  webDir: "app-shell",
  server: {
    url: userAppUrl,
    cleartext: true,
    allowNavigation: [
      "47.238.0.23",
      "stately-sawine-1efd4d.netlify.app"
    ]
  }
};

export default config;
