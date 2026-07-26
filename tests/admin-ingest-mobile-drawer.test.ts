import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const shellSource = readFileSync(
  "components/enterprise-admin/IngestChatGPTShell.tsx",
  "utf8"
);
const resizableSidebarSource = readFileSync(
  "components/enterprise-admin/IngestResizableSidebar.tsx",
  "utf8"
);
const androidActivitySource = readFileSync(
  "android/app/src/main/java/com/aiknowledge/chat/MainActivity.java",
  "utf8"
);

assert.match(
  shellSource,
  /const isAdminApk = voiceState\.platform === "apk"/
);
assert.match(
  shellSource,
  /ADMIN_INGEST_MOBILE_DRAWER_HISTORY_KEY = "__adminIngestMobileDrawer"/
);
assert.match(
  shellSource,
  /window\.history\.pushState\([\s\S]*ADMIN_INGEST_MOBILE_DRAWER_HISTORY_KEY/
);
assert.match(
  shellSource,
  /window\.addEventListener\("popstate", handleMobileDrawerHistoryChange\)/
);
assert.match(
  shellSource,
  /aria-label="打开左侧功能"[\s\S]*<Menu/
);
assert.match(
  shellSource,
  /aria-label="关闭左侧功能"[\s\S]*bg-black\/30/
);
assert.match(
  shellSource,
  /isMobileNavigationOpen \? "translate-x-0" : "pointer-events-none -translate-x-full"/
);
assert.match(
  shellSource,
  /mobileDrawer=\{isAdminApk\}/
);
assert.match(
  shellSource,
  /onSelectConversation=\{\(agentId, conversationId\) => \{[\s\S]*closeMobileNavigation\(\)/
);
assert.match(
  resizableSidebarSource,
  /mobileDrawer = false/
);
assert.match(
  resizableSidebarSource,
  /mobileDrawer[\s\S]*"relative flex h-dvh min-w-0 flex-1 flex-col border-r"/
);
assert.match(
  resizableSidebarSource,
  /style=\{mobileDrawer \? undefined : \{ width \}\}/
);
assert.match(
  resizableSidebarSource,
  /\{!mobileDrawer \? \([\s\S]*cursor-col-resize/
);
assert.match(
  androidActivitySource,
  /onBackPressed\(\)[\s\S]*getWebView\(\)\.canGoBack\(\)[\s\S]*getWebView\(\)\.goBack\(\)/
);

assert.doesNotMatch(
  shellSource,
  /ChatSidebarDrawer/
);

console.log("admin-ingest-mobile-drawer tests passed");
