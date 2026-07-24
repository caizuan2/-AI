import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildAdminIngestWechatGroundingRequest
} from "../lib/enterprise/admin-ingest-wechat-grounding";
import {
  createUploadState,
  stripUploadRuntimeFields
} from "../lib/enterprise/ingest-client";

const evidence = [
  "【微信对话截图识别稿】",
  "客户(左侧)：好的产品有效果首先必须建立在安全的基础上",
  "我(右侧)：妹妹你说得很对",
  "客户(左侧)：现在90%以上时间用来做完美",
  "我(右侧)：妹妹喜欢打篮球吗",
  "我(右侧)：你也在现场观看吗",
  "",
  "【固定角色规则】",
  "从截图底部向上识别到的最近客户消息：现在90%以上时间用来做完美"
].join("\n");

const attachmentBase = {
  extractedText: evidence,
  pageSummaries: ["最近客户消息：现在90%以上时间用来做完美"]
};

async function main() {
  const defaultReply = buildAdminIngestWechatGroundingRequest({
    input: "请根据这张微信对话截图回复客户。",
    attachments: [attachmentBase]
  });
  const explicitReply = buildAdminIngestWechatGroundingRequest({
    input: "请根据这张微信对话截图回复客户。",
    attachments: [{
      ...attachmentBase,
      wechatOutputMode: "reply_script"
    }]
  });
  const fullAnswer = buildAdminIngestWechatGroundingRequest({
    input: "请根据这张微信对话截图回复客户。",
    attachments: [{
      ...attachmentBase,
      wechatOutputMode: "full_answer"
    }]
  });

  assert.equal(defaultReply.outputMode, "reply_script");
  assert.equal(explicitReply.outputMode, "reply_script");
  assert.equal(fullAnswer.outputMode, "full_answer");
  assert.equal(
    defaultReply.modelInput,
    explicitReply.modelInput,
    "默认模式必须保持现有精准回复话术任务不变。"
  );
  assert.match(defaultReply.modelInput, /只输出一段可直接复制发给客户的正文/);
  assert.doesNotMatch(defaultReply.modelInput, /## 核心判断|## 接下来的推进节奏/);

  assert.equal(
    fullAnswer.query,
    defaultReply.query,
    "两种输出方式必须使用完全相同的客户原话和知识库检索词。"
  );
  assert.equal(fullAnswer.latestCustomerMessage, defaultReply.latestCustomerMessage);
  assert.equal(fullAnswer.strictKnowledgeMode, true);
  assert.match(fullAnswer.modelInput, /## 核心判断/);
  assert.match(fullAnswer.modelInput, /## 当下可直接发的回复/);
  assert.match(fullAnswer.modelInput, /## 接下来的推进节奏/);
  assert.match(fullAnswer.modelInput, /## 这几个坑千万别踩/);
  assert.match(fullAnswer.modelInput, /严格依据当前 Agent 已命中的固定知识库/);
  assert.doesNotMatch(
    fullAnswer.modelInput,
    /妹妹喜欢打篮球吗|你也在现场观看吗/,
    "右侧用户消息不能成为完整正文模式的回答目标。"
  );

  const regularRequest = buildAdminIngestWechatGroundingRequest({
    input: "普通图片分析",
    attachments: [{
      extractedText: "普通图片正文",
      wechatOutputMode: "full_answer"
    }]
  });

  assert.deepEqual(regularRequest, {
    isWechatConversation: false,
    strictKnowledgeMode: false,
    query: "普通图片分析",
    modelInput: "普通图片分析",
    latestCustomerMessage: null
  });

  const wechatFile = new File(["wechat"], "wechat.jpg", { type: "image/jpeg" });
  const wechatUpload = createUploadState(wechatFile, {
    platform: "web",
    recognitionMode: "wechat_conversation"
  });
  const ordinaryUpload = createUploadState(wechatFile, { platform: "web" });

  assert.equal(wechatUpload.wechatOutputMode, "reply_script");
  assert.equal(ordinaryUpload.wechatOutputMode, undefined);
  assert.equal(stripUploadRuntimeFields({
    ...wechatUpload,
    wechatOutputMode: "full_answer"
  }).wechatOutputMode, "full_answer");

  const [shellSource, modeToggleSource, routeSource] = await Promise.all([
    readFile("components/enterprise-admin/IngestChatGPTShell.tsx", "utf8"),
    readFile("components/enterprise-admin/IngestModeToggle.tsx", "utf8"),
    readFile("app/api/admin/kb/ingest/gpt/route.ts", "utf8")
  ]);

  assert.match(shellSource, /wechatUpload\s*\?/);
  assert.match(shellSource, /精准回复话术/);
  assert.match(shellSource, /完整正文答案/);
  assert.match(shellSource, /onWechatOutputModeChange\?\.\(option\.mode\)/);
  assert.match(modeToggleSource, /file\.recognitionMode === "wechat_conversation"/);
  assert.match(modeToggleSource, /wechatOutputMode:\s*mode/);
  assert.match(routeSource, /wechatOutputMode:\s*readString\(item\.wechatOutputMode\)/);
  assert.match(routeSource, /input:\s*wechatGroundingRequest\.modelInput/);

  console.log("Admin ingest WeChat output mode tests passed.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
