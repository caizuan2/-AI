import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const modeToggleSource = readFileSync(
  "components/enterprise-admin/IngestModeToggle.tsx",
  "utf8"
);
const shellSource = readFileSync(
  "components/enterprise-admin/IngestChatGPTShell.tsx",
  "utf8"
);

const topModeNavigationStart = modeToggleSource.indexOf('activeRailKey !== "experts"');
const topModeNavigationEnd = modeToggleSource.indexOf('{mode === "knowledge"');
const chatHeaderStart = shellSource.indexOf(
  '<section className="relative flex min-w-0 flex-1 flex-col bg-white">'
);
const chatHeaderEnd = shellSource.indexOf("ref={scrollContainerRef}");

assert.notEqual(topModeNavigationStart, -1);
assert.notEqual(topModeNavigationEnd, -1);
assert.notEqual(chatHeaderStart, -1);
assert.notEqual(chatHeaderEnd, -1);

const topModeNavigation = modeToggleSource.slice(
  topModeNavigationStart,
  topModeNavigationEnd
);
const chatHeader = shellSource.slice(chatHeaderStart, chatHeaderEnd);

assert.doesNotMatch(topModeNavigation, /发布中心/);
assert.doesNotMatch(topModeNavigation, /setMode\("release"\)/);
assert.match(modeToggleSource, /<IngestReleaseConsole/);

assert.doesNotMatch(chatHeader, /训练记录/);
assert.doesNotMatch(chatHeader, /openDrawer\("records"/);
assert.match(shellSource, /openDrawer\("records"/);

console.log("Admin ingest hidden top controls tests passed.");
