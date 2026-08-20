import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shouldUseAdminIngestCompactViewport } from "../lib/enterprise/admin-ingest-mobile-viewport";

const modeToggleSource = readFileSync(
  "components/enterprise-admin/IngestModeToggle.tsx",
  "utf8"
);
const shellSource = readFileSync(
  "components/enterprise-admin/IngestChatGPTShell.tsx",
  "utf8"
);
const modelPickerSource = readFileSync(
  "components/enterprise-admin/IngestGPTModelPicker.tsx",
  "utf8"
);
const promptHistorySource = readFileSync(
  "components/enterprise-admin/IngestPromptHistoryHoverRail.tsx",
  "utf8"
);

assert.equal(shouldUseAdminIngestCompactViewport(520), true);
assert.equal(shouldUseAdminIngestCompactViewport(521), false);
assert.equal(shouldUseAdminIngestCompactViewport(0), false);
assert.equal(shouldUseAdminIngestCompactViewport(Number.NaN), false);

assert.match(
  modeToggleSource,
  /compactMobileViewport=\{useCompactAdminIngestChrome\}/
);
assert.match(shellSource, /data-admin-ingest-layout=/);
assert.match(
  shellSource,
  /paddingTop: "max\(0px, env\(safe-area-inset-top, 0px\), var\(--safe-area-inset-top, 0px\)\)"/
);
assert.match(
  shellSource,
  /paddingBottom: "max\(0px, env\(safe-area-inset-bottom, 0px\), var\(--safe-area-inset-bottom, 0px\)\)"/
);
assert.match(
  shellSource,
  /"fixed inset-y-0 left-0 z-\[70\] box-border[\s\S]*paddingTop: "max\(0px, env\(safe-area-inset-top, 0px\), var\(--safe-area-inset-top, 0px\)\)"[\s\S]*paddingBottom: "max\(0px, env\(safe-area-inset-bottom, 0px\), var\(--safe-area-inset-bottom, 0px\)\)"[\s\S]*paddingLeft: "max\(0px, env\(safe-area-inset-left, 0px\), var\(--safe-area-inset-left, 0px\)\)"/
);
assert.match(
  shellSource,
  /compactMobileViewport \? "h-\[52px\] px-3"/
);
assert.match(shellSource, /overflow-y-auto overscroll-contain/);
assert.match(
  shellSource,
  /compactMobileViewport \? "max-h-\[72px\]" : "max-h-32"/
);
assert.match(
  shellSource,
  /compactMobileViewport \? "max-h-20" : "max-h-\[160px\]"/
);
assert.match(shellSource, /WebkitTextSizeAdjust: "100%", textSizeAdjust: "100%"/);
assert.doesNotMatch(
  shellSource,
  /paddingBottom: "max\(1rem, env\(safe-area-inset-bottom/
);
assert.match(
  shellSource,
  /isMoreOpen[\s\S]*bottom-14 left-0[\s\S]*isAdminApk[\s\S]*max-h-\[calc\(100vh-8rem\)\] overflow-y-auto overscroll-contain supports-\[height:100svh\]:max-h-\[calc\(100svh-8rem\)\] supports-\[height:100dvh\]:max-h-\[calc\(100dvh-8rem\)\]/
);
assert.match(
  shellSource,
  /isConnectionOpen[\s\S]*bottom-11 left-0[\s\S]*isAdminApk[\s\S]*max-h-\[calc\(100vh-8rem\)\] overflow-y-auto overscroll-contain supports-\[height:100svh\]:max-h-\[calc\(100svh-8rem\)\] supports-\[height:100dvh\]:max-h-\[calc\(100dvh-8rem\)\]/
);

assert.match(modelPickerSource, /max-h-\[calc\(100vh-8rem\)\]/);
assert.match(modelPickerSource, /supports-\[height:100svh\]:max-h-\[calc\(100svh-8rem\)\]/);
assert.match(modelPickerSource, /supports-\[height:100dvh\]:max-h-\[calc\(100dvh-8rem\)\]/);

assert.match(
  promptHistorySource,
  /paddingTop: "max\(0px, env\(safe-area-inset-top, 0px\), var\(--safe-area-inset-top, 0px\)\)"/
);
assert.match(
  promptHistorySource,
  /paddingBottom: "max\(0px, env\(safe-area-inset-bottom, 0px\), var\(--safe-area-inset-bottom, 0px\)\)"/
);

console.log("admin-ingest-mobile-fixed-chrome tests passed");
