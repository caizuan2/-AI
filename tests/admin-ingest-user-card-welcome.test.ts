import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("chat-only empty conversations use the Xiaodong welcome while full ingest stays unchanged", () => {
  const page = readFileSync("app/admin-ingest/page.tsx", "utf8");
  const modeToggle = readFileSync("components/enterprise-admin/IngestModeToggle.tsx", "utf8");
  const shell = readFileSync("components/enterprise-admin/IngestChatGPTShell.tsx", "utf8");
  const chatOnlyWelcome = readFileSync(
    "components/enterprise-admin/IngestChatOnlyWelcome.tsx",
    "utf8"
  );

  assert.match(page, /userName=\{user\.name\}/);
  assert.match(modeToggle, /userName\?: string \| null/);
  assert.match(modeToggle, /userName=\{userName\}/);
  assert.match(
    modeToggle,
    /welcomeVariant=\{accessTier === "chat_only" \? "chat_only" : "full_ingest"\}/
  );
  assert.match(
    shell,
    /welcomeVariant === "chat_only" && canIngest \? \([\s\S]*?<IngestChatOnlyWelcome userName=\{userName\} \/>/
  );
  assert.match(
    shell,
    /<IngestWelcomeHero[\s\S]*?quickPrompts\.map/,
    "full-ingest and no-agent empty states must retain the existing welcome and prompt buttons"
  );
  assert.match(
    modeToggle,
    /const shouldShowChatOnlyWelcome = accessTier === "chat_only"\s*&& conversation\.messageCount === 0/,
    "only genuinely empty chat-only conversations should use the welcome state"
  );
  assert.match(
    modeToggle,
    /return shouldShowChatOnlyWelcome\s*\?\s*normalizedMessages\.filter\(\(message\) => !isEmptyHistoryMessage\(message\)\)/,
    "chat-only history restore must discard legacy synthetic empty-history messages"
  );
  assert.match(
    modeToggle,
    /return shouldShowChatOnlyWelcome\s*\?\s*\[\]\s*:\s*createEmptyHistoryMessages/,
    "chat-only empty conversations must stay empty so the welcome remains visible after switching back"
  );
  assert.equal(
    modeToggle.match(/setMessages\(resolveRestoredConversationMessages\(\{/g)?.length,
    2,
    "initial hydration and later conversation switching must share the same empty-state resolver"
  );
  assert.match(
    modeToggle,
    /\}, \[accessTier, activeConversationId,/,
    "initial restore must react to the resolved access tier"
  );
  assert.match(chatOnlyWelcome, /src="\/brand\/xiaodong-ai-logo\.png"/);
  assert.match(chatOnlyWelcome, /小董AI/);
  assert.match(chatOnlyWelcome, /AI大脑🧠 \+ AI思考/);
  assert.match(chatOnlyWelcome, /Hi，\$\{greetingName\}，我是你的沟通助手/);
  for (const label of ["客户对话", "微信截图", "经营疑问", "沟通建议", "下一步建议"]) {
    assert.match(chatOnlyWelcome, new RegExp(label));
  }
  assert.match(chatOnlyWelcome, /试试这样问/);
  assert.match(chatOnlyWelcome, /客户说考虑考虑怎么回复/);
});

test("the user client welcome component remains untouched and independent", () => {
  const chatOnlyWelcome = readFileSync(
    "components/enterprise-admin/IngestChatOnlyWelcome.tsx",
    "utf8"
  );
  const shell = readFileSync("components/enterprise-admin/IngestChatGPTShell.tsx", "utf8");

  assert.doesNotMatch(chatOnlyWelcome, /app\/\(user\)\/chat-ui/);
  assert.doesNotMatch(shell, /app\/\(user\)\/chat-ui\/components\/EmptyState/);
});
