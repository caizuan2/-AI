import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ADMIN_INGEST_DOUBAO_VISIBLE_BUDGET_MS,
  shouldApplyAdminIngestDoubaoVisibleBudget
} from "../lib/enterprise/admin-ingest-doubao-visible-budget";

async function main() {
  const [
    doubaoClient,
    browserRoute,
    ingestClient,
    modeToggle,
    deepseekClient
  ] = await Promise.all([
    readFile("lib/enterprise/doubao-ingest-client.ts", "utf8"),
    readFile("app/api/admin/kb/ingest/gpt/route.ts", "utf8"),
    readFile("lib/enterprise/ingest-client.ts", "utf8"),
    readFile("components/enterprise-admin/IngestModeToggle.tsx", "utf8"),
    readFile("lib/enterprise/deepseek-ingest-client.ts", "utf8")
  ]);

  assert.equal(ADMIN_INGEST_DOUBAO_VISIBLE_BUDGET_MS, 180_000);
  assert.equal(shouldApplyAdminIngestDoubaoVisibleBudget("doubao-pro"), true);
  assert.equal(shouldApplyAdminIngestDoubaoVisibleBudget("deepseek-pro"), false);

  assert.match(doubaoClient, /thinking:\s*\{\s*type:\s*"enabled"/);
  assert.match(doubaoClient, /reasoning_effort:\s*"low"/);
  assert.match(doubaoClient, /max_completion_tokens:\s*payload\.maxTokens/);
  assert.match(doubaoClient, /豆包专用可见正文协议/);
  assert.match(doubaoClient, /不要为了缩短生成时间而压缩、裁剪或省略有价值的最终内容/);
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
  assert.match(
    modeToggle,
    /豆包正在深度思考，最终正文将在生成后按原文显示/
  );

  assert.match(deepseekClient, /runDeepSeekAdminIngest/);
  assert.doesNotMatch(
    deepseekClient,
    /reasoning_activity|doubao_stream_diagnostics|thinking:\s*\{\s*type:\s*"enabled"/,
    "The DeepSeek request and response path must remain independent from this Doubao-only fix."
  );

  console.log("Admin ingest Doubao deep-thinking protocol tests passed.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
