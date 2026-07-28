import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const shellSource = readFileSync(
  "components/enterprise-admin/IngestChatGPTShell.tsx",
  "utf8"
);
const promptHistorySource = readFileSync(
  "components/enterprise-admin/IngestPromptHistoryHoverRail.tsx",
  "utf8"
);

assert.match(
  shellSource,
  /const promptHistoryItems = useMemo<IngestPromptHistoryItem\[\]>\(\(\) => messages[\s\S]*message\.role === "user"[\s\S]*\.slice\(-24\)[\s\S]*\.reverse\(\)/
);
assert.match(
  shellSource,
  /<IngestPromptHistoryHoverRail[\s\S]*items=\{promptHistoryItems\}[\s\S]*onSelect=\{handlePromptHistorySelect\}[\s\S]*mobileFloating=\{isAdminApk\}/
);
assert.match(
  promptHistorySource,
  /mobileFloating\?: boolean/
);
assert.match(
  promptHistorySource,
  /MOBILE_ORB_POSITION_KEY = "admin-ingest-prompt-history-orb-position-v1"/
);
assert.match(
  promptHistorySource,
  /window\.visualViewport\?\.width[\s\S]*window\.visualViewport\?\.height/
);
assert.match(
  promptHistorySource,
  /setPointerCapture\(event\.pointerId\)[\s\S]*onPointerMove=\{handleMobileOrbPointerMove\}[\s\S]*onPointerUp=\{finishMobileOrbDrag\}/
);
assert.match(
  promptHistorySource,
  /Math\.hypot\(deltaX, deltaY\) >= 5/
);
assert.match(
  promptHistorySource,
  /saveMobileOrbPosition\(current\)/
);
assert.match(
  promptHistorySource,
  /aria-label="打开历史提示词"[\s\S]*h-\[52px\] w-\[52px\][\s\S]*touch-none/
);
assert.match(
  promptHistorySource,
  /role="dialog"[\s\S]*aria-modal="true"[\s\S]*点击定位原消息，不会重新发送/
);
assert.match(
  promptHistorySource,
  /onSelect\(item\.id\);[\s\S]*setMobileOpen\(false\)/
);
assert.match(
  promptHistorySource,
  /visibleItems\.length[\s\S]*暂无历史提示词/
);
assert.doesNotMatch(
  promptHistorySource,
  /fetch\(|onSend|setInput|replyMarkdown|modelProvider/
);

console.log("admin-ingest-mobile-prompt-history tests passed");
