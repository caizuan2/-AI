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
  assert.equal(ADMIN_INGEST_VISIBLE_PARSE_WAIT_MS, 60_000);
  assert.equal(shouldApplyAdminIngestDoubaoVisibleBudget("doubao-pro"), true);
  assert.equal(shouldApplyAdminIngestDoubaoVisibleBudget("deepseek-pro"), false);
  assert.equal(shouldApplyAdminIngestVisibleBudget("doubao-pro"), true);
  assert.equal(shouldApplyAdminIngestVisibleBudget("deepseek-pro"), true);
  assert.equal(shouldApplyAdminIngestVisibleBudget("deepseek-flash"), true);

  assert.match(doubaoClient, /enableThinking:\s*input\.modelScope !== "admin-ingest" && reasoningPhase !== null/);
  assert.match(doubaoClient, /DEFAULT_HARD_TIMEOUT_MS = 270_000/);
  assert.match(doubaoClient, /ADMIN_INGEST_HARD_TIMEOUT_MS = 55_000/);
  assert.match(doubaoClient, /DEFAULT_VISIBLE_MAX_TOKENS = 6_000/);
  assert.match(doubaoClient, /ADMIN_INGEST_VISIBLE_MAX_TOKENS = 1_600/);
  assert.match(doubaoClient, /DEFAULT_DOUBAO_CONCURRENCY = 1/);
  assert.match(doubaoClient, /modelScope === "admin-ingest" \? 2 : DEFAULT_DOUBAO_CONCURRENCY/);
  assert.match(doubaoClient, /豆包专用可见正文协议/);
  assert.match(doubaoClient, /ADMIN_INGEST_VISIBLE_SLO_INSTRUCTIONS/);
  assert.match(visiblePrompt, /请在 60 秒内给出可执行的完整答案/);
  assert.match(doubaoClient, /modelScope === "admin-ingest" \? ADMIN_INGEST_VISIBLE_SLO_INSTRUCTIONS : \[\s*"只输出最终自然 Markdown 正文[^\n]+\s*"答案应完整、专业、温和、可执行；不要为了缩短生成时间而压缩、裁剪或省略有价值的最终内容/);
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
  assert.match(modeToggle, /已达到 \$\{doubaoVisibleBudgetSeconds\} 秒时限，本轮未形成完整正文/);
  assert.doesNotMatch(modeToggle, /秒时限交卷原文/);
  assert.match(modeToggle, /shouldApplyAdminIngestVisibleBudget\(requestModelOption\.provider\)/);

  assert.match(deepseekClient, /runDeepSeekAdminIngest/);
  assert.match(deepseekClient, /buildDeepSeekVisibleSystemPrompt/);
  assert.match(deepseekClient, /REQUEST_TIMEOUT_MS = 150_000/);
  assert.match(deepseekClient, /ADMIN_INGEST_REQUEST_TIMEOUT_MS = 55_000/);
  assert.match(deepseekClient, /DEFAULT_ADMIN_INGEST_MAX_TOKENS = 6_000/);
  assert.match(deepseekClient, /ADMIN_INGEST_VISIBLE_MAX_TOKENS = 1_600/);
  assert.match(deepseekClient, /const useVisibleSlo = input\.modelScope === "admin-ingest" && preserveRawReply/);
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
