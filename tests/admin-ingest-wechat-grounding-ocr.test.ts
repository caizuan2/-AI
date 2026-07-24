import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  assessAdminIngestWechatTranscriptReliability,
  inferAdminIngestWechatRoleHintFromColor,
  reconcileAdminIngestWechatRoleTranscripts
} from "../lib/enterprise/ingest-wechat-transcript";
import {
  buildAdminIngestWechatGroundingRequest
} from "../lib/enterprise/admin-ingest-wechat-grounding";

async function main() {
  const greenWideBubbleRole = inferAdminIngestWechatRoleHintFromColor({
    greenPixelRatio: 0.42,
    lightPixelRatio: 0.08,
    x0: 72,
    x1: 520,
    imageWidth: 782
  });

  assert.equal(
    greenWideBubbleRole,
    "user",
    "A wide green bubble must stay user/right even when its text center crosses the page midpoint."
  );

  const whiteLeftBubbleRole = inferAdminIngestWechatRoleHintFromColor({
    greenPixelRatio: 0.01,
    lightPixelRatio: 0.72,
    x0: 68,
    x1: 430,
    imageWidth: 782
  });

  assert.equal(whiteLeftBubbleRole, "customer");
  assert.equal(inferAdminIngestWechatRoleHintFromColor({
    greenPixelRatio: 0.01,
    lightPixelRatio: 0.34,
    x0: 300,
    x1: 500,
    imageWidth: 782
  }), "uncertain");

  const falsePositiveQuality = assessAdminIngestWechatTranscriptReliability({
    confidence: 77.5,
    messageCount: 57,
    customerMessageCount: 38,
    uncertainLineCount: 69,
    segmentCount: 7,
    recognizedSegmentCount: 7,
    latestCustomerMessage: "篮球"
  });

  assert.equal(falsePositiveQuality.reliable, false);
  assert.ok(falsePositiveQuality.reasons.includes("TOO_MANY_UNCERTAIN_LINES"));

  const noisyFalsePositiveQuality = assessAdminIngestWechatTranscriptReliability({
    confidence: 77.5,
    messageCount: 117,
    customerMessageCount: 48,
    uncertainLineCount: 4,
    noisyLineCount: 13,
    segmentCount: 7,
    recognizedSegmentCount: 7,
    latestCustomerMessage: "篮球"
  });

  assert.equal(noisyFalsePositiveQuality.reliable, false);
  assert.ok(noisyFalsePositiveQuality.reasons.includes("TOO_MANY_NOISY_LINES"));

  const reliableQuality = assessAdminIngestWechatTranscriptReliability({
    confidence: 84,
    messageCount: 18,
    customerMessageCount: 8,
    uncertainLineCount: 2,
    segmentCount: 7,
    recognizedSegmentCount: 7,
    latestCustomerMessage: "现在90%以上时间用来做完美"
  });

  assert.equal(reliableQuality.reliable, true);
  assert.deepEqual(reliableQuality.reasons, []);

  const reconciled = reconcileAdminIngestWechatRoleTranscripts({
    visionTranscript: [
      "客户(左侧)：现在90%以上时间用来做完美[截断]",
      "客户(左侧)：现在90%以上时间用来做完美",
      "客户(左侧)：那妹妹就相当于是全职来做了",
      "我(右侧)：胶东在线",
      "客户(左侧)：妹妹喜欢打篮球吗",
      "我(右侧)：我儿子、孙子都很喜欢打篮球",
      "客户(左侧)：你也在现场观看吗"
    ].join("\n"),
    localTranscript: [
      "客户(左侧)：现在90%以上时间用来做完美",
      "我(右侧)：那妹妹就相当于是全职来做了",
      "客户(左侧)：XW 胶东在线",
      "我(右侧)：妹妹喜欢打篮球吗",
      "我(右侧)：我儿子、孙子都很喜欢打",
      "我(右侧)：篮球",
      "我(右侧)：你也在现场观看吗"
    ].join("\n")
  });

  assert.match(reconciled.transcript, /我\(右侧\)：妹妹喜欢打篮球吗/);
  assert.match(reconciled.transcript, /我\(右侧\)：你也在现场观看吗/);
  assert.match(reconciled.transcript, /客户\(左侧\)：胶东在线/);
  assert.equal(
    reconciled.latestCustomerMessage,
    "现在90%以上时间用来做完美",
    "Embedded-image text must not replace the latest customer sentence that needs a reply."
  );

  const evidence = [
    "【微信对话截图识别稿】",
    "客户(左侧)：好的产品有效果首先必须建立在安全的基础上",
    "我(右侧)：妹妹你说得很对",
    "客户(左侧)：现在90%以上时间用来做完美",
    "我(右侧)：妹妹喜欢打篮球吗",
    "我(右侧)：你也在现场观看吗",
    "客户(左侧)：胶东在线",
    "",
    "【固定角色规则】",
    "从截图底部向上识别到的最近客户消息：现在90%以上时间用来做完美",
    "",
    "【回答任务】",
    "只输出一段可直接发给客户的答案正文。"
  ].join("\n");
  const groundingRequest = buildAdminIngestWechatGroundingRequest({
    input: "请根据这张微信对话截图回复客户。",
    attachments: [{
      extractedText: evidence,
      pageSummaries: ["最近客户消息：现在90%以上时间用来做完美"]
    }]
  });

  assert.equal(groundingRequest.isWechatConversation, true);
  assert.equal(groundingRequest.strictKnowledgeMode, true);
  assert.equal(groundingRequest.latestCustomerMessage, "现在90%以上时间用来做完美");
  assert.match(groundingRequest.query, /客户最近消息：现在90%以上时间用来做完美/);
  assert.match(groundingRequest.query, /好的产品有效果首先必须建立在安全的基础上/);
  assert.doesNotMatch(
    groundingRequest.query,
    /妹妹喜欢打篮球吗|你也在现场观看吗|胶东在线/,
    "Messages after the selected customer reply target must not pollute knowledge retrieval."
  );
  assert.doesNotMatch(groundingRequest.query, /请根据这张微信对话截图回复客户/);
  assert.match(
    groundingRequest.modelInput,
    /唯一回复目标：左侧客户的最近消息“现在90%以上时间用来做完美”/
  );
  assert.match(
    groundingRequest.modelInput,
    /右侧绿色消息，是用户本人已经说过的话，只能用于避免重复，不能成为回答对象/
  );
  assert.match(groundingRequest.modelInput, /只输出一段可直接复制发给客户的正文/);
  assert.doesNotMatch(
    groundingRequest.modelInput,
    /妹妹喜欢打篮球吗|你也在现场观看吗/,
    "The model task must identify the reply target without copying later user-side content into the task."
  );

  const regularRequest = buildAdminIngestWechatGroundingRequest({
    input: "普通投喂问题",
    attachments: [{ extractedText: "普通附件正文" }]
  });

  assert.deepEqual(regularRequest, {
    isWechatConversation: false,
    strictKnowledgeMode: false,
    query: "普通投喂问题",
    modelInput: "普通投喂问题",
    latestCustomerMessage: null
  });

  const routeSource = await readFile("app/api/admin/kb/ingest/gpt/route.ts", "utf8");

  assert.match(routeSource, /buildAdminIngestWechatGroundingRequest/);
  assert.match(routeSource, /query:\s*wechatGroundingRequest\.query/);
  assert.match(routeSource, /input:\s*wechatGroundingRequest\.modelInput/);
  assert.match(
    routeSource,
    /strictKnowledgeMode:\s*strictKnowledgeGrounding/,
    "WeChat screenshot requests must enforce current-Agent knowledge grounding for either selected model."
  );
  assert.match(
    routeSource,
    /if\s*\(strictKnowledgeGrounding\s*&&\s*\(!canonicalAgentScope\s*\|\|\s*!grounding\.applied\)\)/
  );
  assert.match(routeSource, /modelInvoked:false/);

  console.log("Admin ingest WeChat OCR reliability and grounding tests passed.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
