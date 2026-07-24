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
  assert.match(fullAnswer.modelInput, /完整正文必须与“精准回复话术”有明显区别/);
  assert.match(fullAnswer.modelInput, /不能退化为只输出一段可直接发送给客户的话术/);
  assert.match(fullAnswer.modelInput, /完整说明当前沟通阶段、客户最近消息的真实意图或顾虑/);
  assert.match(fullAnswer.modelInput, /关键依据；再给出有针对性的解决思路和可执行建议/);
  assert.match(fullAnswer.modelInput, /补充可直接发送的回复示例、下一步沟通节奏及需要注意的风险/);
  assert.match(fullAnswer.modelInput, /即使客户问题较简单/);
  assert.match(fullAnswer.modelInput, /不能缩减成一句简短回复/);
  assert.match(fullAnswer.modelInput, /结构、标题、段落数量、篇幅和表达重点由你根据真实对话自行决定/);
  assert.match(fullAnswer.modelInput, /不得机械套用固定四段模板/);
  assert.match(fullAnswer.modelInput, /不得虚构客户背景、沟通阶段或未出现的顾虑/);
  assert.doesNotMatch(
    fullAnswer.modelInput,
    /简单问题保持简洁|省略不适用的判断、话术、推进建议或注意事项/,
    "完整正文模式不能再使用会让回答退化成短话术的旧约束。"
  );
  assert.doesNotMatch(
    fullAnswer.modelInput,
    /## 核心判断|## 当下可直接发的回复|## 接下来的推进节奏|## 这几个坑千万别踩/,
    "完整正文模式不能再强制模型输出固定四段标题。"
  );
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
  assert.match(shellSource, /根据对话智能组织正文结构、篇幅与重点/);
  assert.match(shellSource, /onWechatOutputModeChange\?\.\(option\.mode\)/);
  assert.match(modeToggleSource, /file\.recognitionMode === "wechat_conversation"/);
  assert.match(modeToggleSource, /wechatOutputMode:\s*mode/);
  assert.match(modeToggleSource, /不得退化为只输出一段精准回复话术/);
  assert.doesNotMatch(
    modeToggleSource,
    /包含核心判断、当下可直接发的回复、接下来的推进节奏和注意事项/,
    "发送前任务说明不能继续要求固定四段结构。"
  );
  assert.match(routeSource, /wechatOutputMode:\s*readString\(item\.wechatOutputMode\)/);
  assert.match(routeSource, /input:\s*wechatGroundingRequest\.modelInput/);

  console.log("Admin ingest WeChat output mode tests passed.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
