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
  /import adminIngestLogo from "@\/assets\/admin-ingest\/web-logo\.png"/
);
assert.match(
  shellSource,
  /aria-label="打开左侧功能"[\s\S]*<NextImage[\s\S]*src=\{adminIngestLogo\}/
);
assert.doesNotMatch(shellSource, /<Menu className=/);
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
const agentCardSelectSource = shellSource.match(
  /function handleAgentCardSelect\(agentId: string\) \{[\s\S]*?\n  \}/
)?.[0];

assert.ok(agentCardSelectSource);
assert.match(agentCardSelectSource, /setActiveAgentId\(agentId\)/);
assert.doesNotMatch(agentCardSelectSource, /closeMobileNavigation\(\)/);
assert.match(
  shellSource,
  /searchIngestAgentSidebar\(agents, agentConversations, searchKeyword\)/
);
assert.match(
  shellSource,
  /const isConversationListVisible = isExpanded \|\| hasGeneratingConversation \|\| hasConversationMatches/
);
assert.match(
  shellSource,
  /placeholder="搜索 Agent \/ 对话"/
);
assert.match(
  shellSource,
  /没有找到相关 Agent 或对话/
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
  /left-\[72px\] right-\[72px\][\s\S]*max-w-\[164px\]/
);
assert.ok(mobileHeaderCardSource, "管理员 APK 顶部 Agent 卡片应存在");
assert.match(
  mobileHeaderCardSource,
  /className="w-full max-w-\[164px\] overflow-hidden px-1 py-0\.5"/
);
assert.doesNotMatch(
  mobileHeaderCardSource,
  /rounded-\[13px\]|border-\[#c9f0eb\]|bg-\[#e9fbf9\]|shadow-\[0_4px_12px_rgba\(23,157,143,0\.1\)\]/
);
assert.doesNotMatch(
  mobileHeaderCardSource,
  /IngestAgentAvatar|bg-gradient-to-b|left-0 w-\[3px\]/
);
assert.match(
  mobileHeaderCardSource,
  /rounded-\[9px\] border border-\[#ebe5dc\] bg-white px-2\.5 py-0\.5[\s\S]*text-\[13px\] font-semibold[\s\S]*shadow-\[0_2px_6px_rgba\(55,45,35,0\.1\)\][\s\S]*\{activeAgent\.name\}[\s\S]*truncate text-center text-\[10px\] font-normal[\s\S]*\{activeConversation\.title\}/
);
assert.match(
  shellSource,
  /activeConversation[\s\S]*当前 Agent：\$\{activeAgent\.name\}，当前对话：\$\{activeConversation\.title\}/
);
assert.match(
  shellSource,
  /agentIndex < filteredAgentResults\.length - 1[\s\S]*"mb-1\.5 border-b border-\[#e3e3df\]"/
);
assert.match(
  shellSource,
  /isActive[\s\S]*border-orange-200 bg-gradient-to-r from-orange-50 via-amber-50 to-white shadow-sm[\s\S]*border-\[#e4e8e5\] bg-\[#f7f9f8\] shadow-\[0_2px_8px_rgba\(36,49,42,0\.06\)\] hover:border-\[#d9dfdb\] hover:bg-white hover:shadow-\[0_4px_12px_rgba\(36,49,42,0\.09\)\]/
);
assert.match(
  shellSource,
  /<IngestPromptHistoryHoverRail[\s\S]*mobileFloating=\{isAdminApk\}/
);
assert.match(
  shellSource,
  /ingestPrimaryRailFeatures[\s\S]*\.filter\(\(item\) => item\.enabled !== false\)/
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
