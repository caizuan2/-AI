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
const mobileHeaderCardSource = shellSource.match(
  /isAdminApk && canIngest && welcomeVariant === "chat_only" \? \([\s\S]*?\) : null\}\s*<IngestGPTModelPicker/
)?.[0] ?? "";

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
  shellSource,
  /const activeConversation = useMemo\([\s\S]*conversation\.id === activeConversationId[\s\S]*conversation\.agentId === activeAgent\.id[\s\S]*conversation\.status !== "archived"/
);
assert.match(
  shellSource,
  /isAdminApk && canIngest && welcomeVariant === "chat_only"/
);
assert.match(
  shellSource,
  /left-\[72px\] right-\[72px\][\s\S]*max-w-\[180px\]/
);
assert.ok(mobileHeaderCardSource, "管理员 APK 顶部 Agent 卡片应存在");
assert.match(
  mobileHeaderCardSource,
  /rounded-xl border border-\[#e8e5df\] bg-\[#fffdfa\][\s\S]*shadow-\[0_2px_10px_rgba\(55,45,35,0\.06\)\]/
);
assert.doesNotMatch(
  mobileHeaderCardSource,
  /IngestAgentAvatar|bg-gradient-to-b|left-0 w-\[3px\]/
);
assert.match(
  mobileHeaderCardSource,
  /truncate text-center text-\[14px\] font-semibold[\s\S]*\{activeAgent\.name\}[\s\S]*truncate text-center text-\[11px\] font-normal[\s\S]*\{activeConversation\.title\}/
);
assert.match(
  shellSource,
  /activeConversation[\s\S]*当前 Agent：\$\{activeAgent\.name\}，当前对话：\$\{activeConversation\.title\}/
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
