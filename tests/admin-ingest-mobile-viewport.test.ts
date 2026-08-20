import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveAdminIngestMobileViewportHeight } from "../lib/enterprise/admin-ingest-mobile-viewport";

const modeToggleSource = readFileSync(
  "components/enterprise-admin/IngestModeToggle.tsx",
  "utf8"
);
const shellSource = readFileSync(
  "components/enterprise-admin/IngestChatGPTShell.tsx",
  "utf8"
);
const sidebarSource = readFileSync(
  "components/enterprise-admin/IngestResizableSidebar.tsx",
  "utf8"
);

assert.equal(resolveAdminIngestMobileViewportHeight({
  visualViewportHeight: 612.4,
  innerHeight: 780
}), 612, "软键盘弹出后应优先采用 visualViewport 可见高度，不能重复扣减键盘高度");
assert.equal(resolveAdminIngestMobileViewportHeight({
  visualViewportHeight: 780,
  innerHeight: 520
}), 520, "旧 WebView 暴露但不更新 visualViewport 时应采用已经缩小的 innerHeight");
assert.equal(resolveAdminIngestMobileViewportHeight({
  visualViewportHeight: undefined,
  innerHeight: 701.6
}), 702, "旧 WebView 不提供 visualViewport 时应回退到 innerHeight");
assert.equal(resolveAdminIngestMobileViewportHeight({
  visualViewportHeight: 0,
  innerHeight: 640
}), 640, "WebView 尺寸切换瞬间的无效高度不能把页面压成零高");
assert.equal(resolveAdminIngestMobileViewportHeight({
  visualViewportHeight: Number.NaN,
  innerHeight: null
}), null);

assert.match(
  modeToggleSource,
  /h-screen supports-\[height:100svh\]:h-svh supports-\[height:100dvh\]:h-dvh/
);
assert.match(
  modeToggleSource,
  /visualViewport\?\.addEventListener\("resize", updateHeight\)[\s\S]*visualViewport\?\.addEventListener\("scroll", updateHeight\)/
);
assert.match(
  modeToggleSource,
  /window\.addEventListener\("orientationchange", updateHeight\)[\s\S]*window\.addEventListener\("focus", updateHeight\)[\s\S]*window\.addEventListener\("pageshow", updateHeight\)/
);
assert.match(
  modeToggleSource,
  /document\.addEventListener\("visibilitychange", updateHeightWhenVisible\)/
);
assert.match(
  modeToggleSource,
  /style=\{isAdminApkViewport && adminIngestMobileViewportHeight !== null[\s\S]*height: `\$\{adminIngestMobileViewportHeight\}px`/
);

assert.match(shellSource, /isAdminApk \? "h-full" : "h-screen"/);
assert.match(
  shellSource,
  /<section className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-white">/
);
assert.match(
  shellSource,
  /paddingBottom: "max\(0px, env\(safe-area-inset-bottom, 0px\), var\(--safe-area-inset-bottom, 0px\)\)"/
);
assert.match(
  sidebarSource,
  /mobileDrawer[\s\S]*"relative flex h-full min-h-0 min-w-0 flex-1 flex-col border-r"/
);

assert.doesNotMatch(modeToggleSource, /document\.documentElement\.style/);
assert.doesNotMatch(shellSource, /WebkitTextSizeAdjust: "none"|textSizeAdjust: "none"/);

console.log("admin-ingest-mobile-viewport tests passed");
