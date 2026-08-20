import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const adminCapacitorConfig = readFileSync("capacitor.admin.config.ts", "utf8");
const userCapacitorConfig = readFileSync("capacitor.config.ts", "utf8");
const mainActivity = readFileSync(
  "android/app/src/main/java/com/aiknowledge/chat/MainActivity.java",
  "utf8"
);
const adminBuildScript = readFileSync(
  "scripts/build-admin-android-apk.ps1",
  "utf8"
);

assert.match(
  adminCapacitorConfig,
  /plugins:\s*\{\s*SystemBars:\s*\{\s*insetsHandling:\s*"css"\s*\}\s*\}/,
  "管理员 APK 必须显式启用 Capacitor SystemBars CSS 安全区"
);
assert.doesNotMatch(
  userCapacitorConfig,
  /SystemBars|insetsHandling/,
  "管理员 APK 安全区配置不得泄漏到用户 APK"
);
assert.match(
  adminBuildScript,
  /"cap",\s*"sync",\s*"android",\s*"--config",\s*"capacitor\.admin\.config\.ts"/,
  "管理员 APK 构建必须同步专用 Capacitor 配置"
);
assert.match(
  adminBuildScript,
  /Copy-Item\s+-LiteralPath\s+\$AdminConfig\s+-Destination\s+\$UserConfig\s+-Force/,
  "Capacitor --config 不可用时仍必须使用管理员配置降级构建"
);

const adminCreationBranch = mainActivity.match(
  /if \(adminShell\) \{[\s\S]*?configureAdminShellDisplay\(webView\);[\s\S]*?\} else \{[\s\S]*?loadFreshUserShell\(webView, "__native_session"\);[\s\S]*?\}/
)?.[0];
assert.ok(adminCreationBranch, "原生显示保护必须只进入管理员 APK 分支");

const adminDisplayMethod = mainActivity.match(
  /private void configureAdminShellDisplay\(WebView webView\) \{[\s\S]*?\n    \}/
)?.[0] ?? "";
assert.match(adminDisplayMethod, /!isAdminShell\(\)/);
assert.match(adminDisplayMethod, /requestAdminShellWindowInsets\(webView\)/);
assert.doesNotMatch(
  mainActivity,
  /setTextZoom\s*\(|setSupportZoom\s*\(|setBuiltInZoomControls\s*\(|setDisplayZoomControls\s*\(/,
  "不得改写 WebView 缩放能力，否则会破坏正文无障碍可读性"
);

const insetMethod = mainActivity.match(
  /private void requestAdminShellWindowInsets\(WebView webView\) \{[\s\S]*?\n    \}/
)?.[0] ?? "";
assert.match(insetMethod, /!isAdminShell\(\)/);
assert.match(insetMethod, /getParent\(\)/);
assert.match(insetMethod, /requestApplyInsets\(\)/);
assert.match(
  mainActivity,
  /onResume\(\)[\s\S]*?if \(isAdminShell\(\)\) \{[\s\S]*?requestAdminShellWindowInsets/
);

console.log("admin-ingest APK system-bars tests passed");
