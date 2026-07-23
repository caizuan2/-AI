import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  hasAdminIngestWechatConversationAttachment,
  shouldRunAdminIngestHealthPreflight,
  shouldRetryAdminIngestWechatModelTimeout
} from "../lib/enterprise/admin-ingest-wechat-request";

async function main() {
  assert.equal(hasAdminIngestWechatConversationAttachment([
    { recognitionMode: "wechat_conversation" }
  ]), true);
  assert.equal(hasAdminIngestWechatConversationAttachment([
    { recognitionMode: "document" }
  ]), false);

  assert.equal(shouldRetryAdminIngestWechatModelTimeout({
    attempt: 0,
    modelProvider: "doubao-pro",
    causeCode: "DOUBAO_TIMEOUT"
  }), true);
  assert.equal(shouldRetryAdminIngestWechatModelTimeout({
    attempt: 0,
    modelProvider: "deepseek-pro",
    errorCode: "DEEPSEEK_TIMEOUT"
  }), true);
  assert.equal(shouldRetryAdminIngestWechatModelTimeout({
    attempt: 1,
    modelProvider: "doubao-pro",
    causeCode: "DOUBAO_TIMEOUT"
  }), false);
  assert.equal(shouldRetryAdminIngestWechatModelTimeout({
    attempt: 0,
    modelProvider: "doubao-pro",
    causeCode: "DOUBAO_API_KEY_INVALID"
  }), false);
  assert.equal(shouldRunAdminIngestHealthPreflight({
    modelProvider: "deepseek-pro"
  }), true);
  assert.equal(shouldRunAdminIngestHealthPreflight({
    modelProvider: "deepseek-pro",
    skipHealthPreflight: true
  }), false);
  assert.equal(shouldRunAdminIngestHealthPreflight({
    modelProvider: "doubao-pro"
  }), false);

  const root = process.cwd();
  const modeToggleSource = await readFile(
    path.join(root, "components", "enterprise-admin", "IngestModeToggle.tsx"),
    "utf8"
  );
  const ingestClientSource = await readFile(
    path.join(root, "lib", "enterprise", "ingest-client.ts"),
    "utf8"
  );

  assert.match(
    modeToggleSource,
    /isWechatConversationReply\s*\?\s*\{\s*promptPreview:\s*null,[\s\S]*WECHAT_DIRECT_REPLY_SKIPPED_MEMORY_PREVIEW/
  );
  assert.match(
    modeToggleSource,
    /messages:\s*isWechatConversationReply\s*\?\s*\[\]\s*:\s*conversationState\.messages/
  );
  assert.match(
    modeToggleSource,
    /recentTrainingRecords:\s*isWechatConversationReply\s*\?\s*\[\]/
  );
  assert.match(
    modeToggleSource,
    /skipHealthPreflight:\s*isWechatConversationReply/
  );
  assert.match(
    modeToggleSource,
    /canRetryWechatTimeout = isWechatConversationReply\s*&& !visibleReplyRendered\s*&& shouldRetryAdminIngestWechatModelTimeout\(\{[\s\S]*modelProvider:\s*requestModelOption\.provider/
  );
  assert.match(
    modeToggleSource,
    /setNoticeMessage\(`\$\{requestModelOption\.label\} 首次等待超时，正在使用同一个模型自动重试\.\.\.`\)/
  );
  assert.match(
    ingestClientSource,
    /shouldRunAdminIngestHealthPreflight\(\{[\s\S]*skipHealthPreflight: input\.skipHealthPreflight/
  );
  assert.match(
    modeToggleSource,
    /const assistantContent = result\.replyMarkdown \|\|/
  );

  console.log("Admin ingest WeChat answer timeout regression tests passed.");
}

void main();
