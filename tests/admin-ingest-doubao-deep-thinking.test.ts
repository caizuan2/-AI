import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ADMIN_INGEST_DOUBAO_VISIBLE_BUDGET_MS,
  ADMIN_INGEST_VISIBLE_PARSE_WAIT_MS,
  shouldApplyAdminIngestDoubaoVisibleBudget,
  shouldApplyAdminIngestVisibleBudget
} from "../lib/enterprise/admin-ingest-doubao-visible-budget";

async function main() {
  const [
    doubaoClient,
    browserRoute,
    ingestClient,
    modeToggle,
    deepseekClient,
    visiblePrompt
  ] = await Promise.all([
    readFile("lib/enterprise/doubao-ingest-client.ts", "utf8"),
    readFile("app/api/admin/kb/ingest/gpt/route.ts", "utf8"),
    readFile("lib/enterprise/ingest-client.ts", "utf8"),
    readFile("components/enterprise-admin/IngestModeToggle.tsx", "utf8"),
    readFile("lib/enterprise/deepseek-ingest-client.ts", "utf8"),
    readFile("lib/enterprise/admin-ingest-visible-prompt.ts", "utf8")
  ]);

  assert.equal(ADMIN_INGEST_DOUBAO_VISIBLE_BUDGET_MS, 60_000);
  assert.equal(ADMIN_INGEST_VISIBLE_PARSE_WAIT_MS, 10_000);
  assert.equal(shouldApplyAdminIngestDoubaoVisibleBudget("doubao-pro"), true);
  assert.equal(shouldApplyAdminIngestDoubaoVisibleBudget("deepseek-pro"), false);
  assert.equal(shouldApplyAdminIngestVisibleBudget("doubao-pro"), true);
  assert.equal(shouldApplyAdminIngestVisibleBudget("deepseek-pro"), true);
  assert.equal(shouldApplyAdminIngestVisibleBudget("deepseek-flash"), true);

  assert.match(doubaoClient, /enableThinking:\s*false/);
  assert.match(doubaoClient, /DEFAULT_HARD_TIMEOUT_MS = 55_000/);
  assert.match(doubaoClient, /DEFAULT_VISIBLE_MAX_TOKENS = 1_600/);
  assert.match(doubaoClient, /DEFAULT_DOUBAO_CONCURRENCY = 2/);
  assert.match(doubaoClient, /豆包专用可见正文协议/);
  assert.match(doubaoClient, /ADMIN_INGEST_VISIBLE_SLO_INSTRUCTIONS/);
  assert.match(visiblePrompt, /请在 60 秒内给出可执行的完整答案/);
  assert.doesNotMatch(doubaoClient, /不要为了缩短生成时间而压缩、裁剪或省略有价值的最终内容/);
  assert.doesNotMatch(
    doubaoClient,
    /buildGptIngestBrainSystemPrompt|buildGptIngestBrainUserPrompt/,
    "Doubao visible output must not inherit unrelated backend JSON and autonomous-loop instructions."
  );
  assert.match(doubaoClient, /delta\.reasoning_content/);
  assert.match(doubaoClient, /type:\s*"reasoning_activity"/);
  assert.match(
    doubaoClient,
    /accumulator\.content \+= delta\.content/,
    "Only provider content may be accumulated into the visible raw Markdown body."
  );
  assert.doesNotMatch(
    doubaoClient,
    /content \+= delta\.reasoning_content/,
    "Private provider reasoning must never be appended to the visible answer."
  );
  assert.match(browserRoute, /event\.type === "reasoning_activity"/);
  assert.match(ingestClient, /"reasoning_activity"/);
  assert.match(modeToggle, /已按 \$\{doubaoVisibleBudgetSeconds\} 秒时限交卷原文/);
  assert.match(modeToggle, /shouldApplyAdminIngestVisibleBudget\(requestModelOption\.provider\)/);

  assert.match(deepseekClient, /runDeepSeekAdminIngest/);
  assert.match(deepseekClient, /buildDeepSeekVisibleSystemPrompt/);
  assert.match(deepseekClient, /REQUEST_TIMEOUT_MS = 55_000/);
  assert.match(deepseekClient, /DEFAULT_ADMIN_INGEST_MAX_TOKENS = 1_600/);
  assert.doesNotMatch(
    deepseekClient,
    /thinking:\s*\{\s*type:\s*"enabled"/,
    "The DeepSeek request must not enable Doubao-only thinking payloads."
  );

  console.log("Admin ingest visible original SLO protocol tests passed.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
