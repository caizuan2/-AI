import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  assessAdminIngestWechatTranscriptReliability,
  buildAdminIngestWechatTranscript,
  inferAdminIngestWechatRoleHintFromColor,
  parseAdminIngestWechatRoleTranscript,
  reconcileAdminIngestWechatRoleTranscripts,
  verifyAdminIngestWechatTailRole
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

  const verifiedRealImageTail = verifyAdminIngestWechatTailRole({
    visionTranscript: [
      "客户(左侧)：我儿子、孙子都很喜欢打篮球",
      "客户(左侧)：你也在现场观看吗"
    ].join("\n"),
    localTranscript: [
      "客户(左侧)：我儿子、孙子都很喜欢打篮球",
      "我(右侧)：你也在现场观看吗"
    ].join("\n"),
    localRoleReliable: true
  });

  assert.equal(verifiedRealImageTail.status, "verified");
  assert.equal(verifiedRealImageTail.tailRole, "user");
  assert.match(verifiedRealImageTail.transcript.transcript, /我\(右侧\)：你也在现场观看吗$/);

  const visionMislabelledTail = [
    "客户(左侧)：我儿子、孙子都很喜欢打篮球",
    "客户(左侧)：你也在现场观看吗"
  ].join("\n");
  const localGeometryTail = [
    "客户(左侧)：我儿子、孙子都很喜欢打篮球",
    "我(右侧)：你也在现场观看吗"
  ].join("\n");
  const strictTailEvidence = {
    confidence: 88,
    roleSource: "color" as const,
    isLowestNonNoiseEvidence: true
  };
  const globalUnreliableTail = verifyAdminIngestWechatTailRole({
    visionTranscript: visionMislabelledTail,
    localTranscript: localGeometryTail,
    localRoleReliable: false
  });
  const strictVerifiedTail = verifyAdminIngestWechatTailRole({
    visionTranscript: visionMislabelledTail,
    localTranscript: localGeometryTail,
    localRoleReliable: false,
    policy: "tail_strict",
    localTailEvidence: strictTailEvidence
  });

  assert.equal(globalUnreliableTail.status, "insufficient");
  assert.equal(globalUnreliableTail.diagnostics.reason, "GLOBAL_ROLE_UNRELIABLE");
  assert.equal(strictVerifiedTail.status, "verified");
  assert.equal(strictVerifiedTail.tailRole, "user");
  assert.equal(strictVerifiedTail.diagnostics.policy, "tail_strict");
  assert.equal(strictVerifiedTail.diagnostics.bestScoreBucket, "exact");

  const lowConfidenceStrictTail = verifyAdminIngestWechatTailRole({
    visionTranscript: visionMislabelledTail,
    localTranscript: localGeometryTail,
    localRoleReliable: false,
    policy: "tail_strict",
    localTailEvidence: { ...strictTailEvidence, confidence: 59 }
  });
  assert.equal(lowConfidenceStrictTail.status, "insufficient");
  assert.equal(lowConfidenceStrictTail.diagnostics.reason, "TAIL_CONFIDENCE_LOW");

  const uncertainSourceStrictTail = verifyAdminIngestWechatTailRole({
    visionTranscript: visionMislabelledTail,
    localTranscript: localGeometryTail,
    localRoleReliable: false,
    policy: "tail_strict",
    localTailEvidence: { ...strictTailEvidence, roleSource: "uncertain" }
  });
  assert.equal(uncertainSourceStrictTail.status, "insufficient");
  assert.equal(uncertainSourceStrictTail.diagnostics.reason, "TAIL_ROLE_SOURCE_UNRELIABLE");

  const nonLowestStrictTail = verifyAdminIngestWechatTailRole({
    visionTranscript: visionMislabelledTail,
    localTranscript: localGeometryTail,
    localRoleReliable: false,
    policy: "tail_strict",
    localTailEvidence: { ...strictTailEvidence, isLowestNonNoiseEvidence: false }
  });
  assert.equal(nonLowestStrictTail.status, "insufficient");
  assert.equal(nonLowestStrictTail.diagnostics.reason, "TAIL_NOT_LOWEST_NON_NOISE_EVIDENCE");

  const strictMismatchedTail = verifyAdminIngestWechatTailRole({
    visionTranscript: visionMislabelledTail,
    localTranscript: "我(右侧)：完全不同的本地尾句",
    localRoleReliable: false,
    policy: "tail_strict",
    localTailEvidence: strictTailEvidence
  });
  assert.equal(strictMismatchedTail.status, "insufficient");
  assert.equal(strictMismatchedTail.diagnostics.reason, "TAIL_TEXT_MISMATCH");

  const localTranscriptWithLaterMessage = [
    "我(右侧)：你也在现场观看吗",
    "客户(左侧)：这是本地识别到的更晚有效消息"
  ].join("\n");
  const strictNonTailMatch = verifyAdminIngestWechatTailRole({
    visionTranscript: "客户(左侧)：你也在现场观看吗",
    localTranscript: localTranscriptWithLaterMessage,
    localRoleReliable: false,
    policy: "tail_strict",
    localTailEvidence: strictTailEvidence
  });
  assert.equal(strictNonTailMatch.status, "insufficient");
  assert.equal(strictNonTailMatch.diagnostics.reason, "MATCH_NOT_LOCAL_TAIL");

  const transcriptWithLowerUncertainEvidence = buildAdminIngestWechatTranscript([
    {
      text: "你也在现场观看吗",
      confidence: 88,
      x0: 500,
      x1: 760,
      y0: 100,
      y1: 140,
      imageWidth: 782,
      roleHint: "user"
    },
    {
      text: "底部还有一条未能确定左右侧的有效内容",
      confidence: 85,
      x0: 350,
      x1: 430,
      y0: 300,
      y1: 340,
      imageWidth: 782,
      roleHint: "uncertain"
    }
  ]);
  assert.equal(transcriptWithLowerUncertainEvidence.tailRoleEvidence?.roleSource, "color");
  assert.equal(
    transcriptWithLowerUncertainEvidence.tailRoleEvidence?.isLowestNonNoiseEvidence,
    false
  );

  const composerChromeFixture = [
    {
      text: "你也在现场观看吗",
      confidence: 91,
      x0: 500,
      x1: 760,
      y0: 760,
      y1: 810,
      imageWidth: 782,
      roleHint: "user" as const
    },
    {
      text: "图标",
      confidence: 29,
      x0: 680,
      x1: 730,
      y0: 930,
      y1: 970,
      imageWidth: 782,
      roleHint: "uncertain" as const
    }
  ];
  const globalComposerTranscript = buildAdminIngestWechatTranscript(composerChromeFixture, {
    imageHeight: 1_000
  });
  const strictComposerTranscript = buildAdminIngestWechatTranscript(composerChromeFixture, {
    imageHeight: 1_000,
    tailStrictComposerFilter: true
  });

  assert.equal(globalComposerTranscript.messages.at(-1)?.text, "图标");
  assert.equal(strictComposerTranscript.messages.at(-1)?.text, "你也在现场观看吗");
  assert.equal(strictComposerTranscript.filteredTailComposerChromeCount, 1);
  assert.equal(strictComposerTranscript.tailRoleEvidence?.confidence, 91);

  const coloredShortCustomerTail = buildAdminIngestWechatTranscript([
    composerChromeFixture[0],
    {
      text: "嗯",
      confidence: 29,
      x0: 42,
      x1: 120,
      y0: 930,
      y1: 970,
      imageWidth: 782,
      roleHint: "customer"
    }
  ], {
    imageHeight: 1_000,
    tailStrictComposerFilter: true
  });
  assert.equal(coloredShortCustomerTail.messages.at(-1)?.text, "嗯");
  assert.equal(coloredShortCustomerTail.filteredTailComposerChromeCount, 0);
  assert.equal(coloredShortCustomerTail.tailRoleEvidence?.roleSource, "color");

  const nonBottomShortGeometry = buildAdminIngestWechatTranscript([
    composerChromeFixture[0],
    { ...composerChromeFixture[1], y0: 840, y1: 870 }
  ], {
    imageHeight: 1_000,
    tailStrictComposerFilter: true
  });
  assert.equal(nonBottomShortGeometry.messages.at(-1)?.text, "图标");
  assert.equal(nonBottomShortGeometry.filteredTailComposerChromeCount, 0);

  const bottomLongGeometry = buildAdminIngestWechatTranscript([
    composerChromeFixture[0],
    { ...composerChromeFixture[1], text: "这是底部真实的较长消息" }
  ], {
    imageHeight: 1_000,
    tailStrictComposerFilter: true
  });
  assert.equal(bottomLongGeometry.messages.at(-1)?.text, "这是底部真实的较长消息");
  assert.equal(bottomLongGeometry.filteredTailComposerChromeCount, 0);

  const markdownRoleTranscript = parseAdminIngestWechatRoleTranscript([
    "- **客户(左侧)：** 还是经常醒",
    "2. **我（右侧）**：你也在现场观看吗"
  ].join("\n"), { allowMarkdownRoleLabelWrapper: true });
  assert.equal(markdownRoleTranscript.messages.length, 2);
  assert.equal(markdownRoleTranscript.messages[0]?.role, "customer");
  assert.equal(markdownRoleTranscript.messages.at(-1)?.role, "user");
  assert.equal(markdownRoleTranscript.messages.at(-1)?.text, "你也在现场观看吗");

  const globalMarkdownRoleTranscript = parseAdminIngestWechatRoleTranscript([
    "- **客户(左侧)：** 还是经常醒",
    "2. **我（右侧）**：你也在现场观看吗"
  ].join("\n"));
  assert.equal(globalMarkdownRoleTranscript.messages.length, 0);

  const freeTextWithoutRoleLabels = parseAdminIngestWechatRoleTranscript([
    "- 客户刚刚说还是经常醒",
    "2. 你也在现场观看吗"
  ].join("\n"));
  assert.equal(freeTextWithoutRoleLabels.messages.length, 0);

  const unmatchedRealImageTail = verifyAdminIngestWechatTailRole({
    visionTranscript: [
      "客户(左侧)：我儿子、孙子都很喜欢打篮球",
      "客户(左侧)：你也在现场观看吗"
    ].join("\n"),
    localTranscript: "我(右侧)：另一条无法匹配的消息",
    localRoleReliable: true
  });

  assert.equal(unmatchedRealImageTail.status, "insufficient");
  assert.equal(unmatchedRealImageTail.tailRole, "uncertain");

  const unverifiedWaitingTailWithoutLocalMatch = verifyAdminIngestWechatTailRole({
    visionTranscript: [
      "客户(左侧)：我儿子、孙子都很喜欢打篮球",
      "我(右侧)：你也在现场观看吗"
    ].join("\n"),
    localTranscript: "",
    localRoleReliable: false
  });

  assert.equal(unverifiedWaitingTailWithoutLocalMatch.status, "insufficient");
  assert.equal(unverifiedWaitingTailWithoutLocalMatch.tailRole, "uncertain");

  const visionMissedLaterUserTail = verifyAdminIngestWechatTailRole({
    visionTranscript: "客户(左侧)：我儿子、孙子都很喜欢打篮球",
    localTranscript: [
      "客户(左侧)：我儿子、孙子都很喜欢打篮球",
      "我(右侧)：你也在现场观看吗"
    ].join("\n"),
    localRoleReliable: true
  });

  assert.equal(visionMissedLaterUserTail.status, "insufficient");
  assert.equal(visionMissedLaterUserTail.tailRole, "uncertain");

  const visionMissedLaterCustomerTail = verifyAdminIngestWechatTailRole({
    visionTranscript: "客户(左侧)：我儿子、孙子都很喜欢打篮球",
    localTranscript: [
      "客户(左侧)：我儿子、孙子都很喜欢打篮球",
      "客户(左侧)：还好"
    ].join("\n"),
    localRoleReliable: true
  });

  assert.equal(visionMissedLaterCustomerTail.status, "insufficient");
  assert.equal(visionMissedLaterCustomerTail.tailRole, "uncertain");

  const waitingEvidence = [
    "【微信对话截图识别稿】",
    "客户(左侧)：我儿子、孙子都很喜欢打篮球",
    "我(右侧)：你也在现场观看吗",
    "",
    "【固定角色规则】",
    "从截图底部向上识别到的最近客户消息：我儿子、孙子都很喜欢打篮球"
  ].join("\n");
  const waitingForCustomer = buildAdminIngestWechatGroundingRequest({
    input: "请根据这张微信对话截图输出完整正文。",
    attachments: [{
      extractedText: waitingEvidence,
      pageSummaries: ["最近客户消息：我儿子、孙子都很喜欢打篮球"],
      wechatOutputMode: "full_answer"
    }]
  });

  assert.equal(waitingForCustomer.currentTurnState, "waiting_for_customer");
  assert.equal(waitingForCustomer.latestCustomerMessage, null);
  assert.equal(waitingForCustomer.latestUserMessage, "你也在现场观看吗");
  assert.match(waitingForCustomer.query, /当前回合状态：用户已发送最后一条消息，正在等待客户回复/);
  assert.match(waitingForCustomer.modelInput, /当前回合锚点：.*右侧用户本人“你也在现场观看吗”/);
  assert.match(waitingForCustomer.modelInput, /应等待客户回复/);
  assert.match(waitingForCustomer.modelInput, /分支处理建议/);
  assert.doesNotMatch(
    waitingForCustomer.modelInput,
    /唯一回复目标：.*我儿子、孙子都很喜欢打篮球/,
    "A completed right-side turn must never reopen an earlier customer message as the reply target."
  );

  const unverifiedTail = buildAdminIngestWechatGroundingRequest({
    input: "请根据这张微信对话截图输出完整正文。",
    attachments: [{
      extractedText: [
        "【微信对话截图识别稿】",
        "客户(左侧)：我儿子、孙子都很喜欢打篮球",
        "客户(左侧)：你也在现场观看吗",
        "",
        "【当前回合角色核验】证据不足"
      ].join("\n"),
      pageSummaries: ["最近客户消息：你也在现场观看吗"],
      wechatOutputMode: "full_answer"
    }]
  });

  assert.equal(unverifiedTail.currentTurnState, "evidence_insufficient");
  assert.equal(unverifiedTail.latestCustomerMessage, null);
  assert.match(unverifiedTail.query, /证据不足，不得回退到更早消息/);
  assert.doesNotMatch(unverifiedTail.modelInput, /唯一回复目标/);

  const replyRequiredEvidence = [
    "【微信对话截图识别稿】",
    "我(右侧)：我儿子、孙子都很喜欢打篮球",
    "客户(左侧)：你也在现场观看吗",
    "",
    "【固定角色规则】",
    "从截图底部向上识别到的最近客户消息：你也在现场观看吗"
  ].join("\n");
  const replyRequired = buildAdminIngestWechatGroundingRequest({
    input: "请根据这张微信对话截图输出完整正文。",
    attachments: [{
      extractedText: replyRequiredEvidence,
      pageSummaries: ["最近客户消息：你也在现场观看吗"],
      wechatOutputMode: "full_answer"
    }]
  });

  assert.equal(replyRequired.currentTurnState, "reply_required");
  assert.equal(replyRequired.latestCustomerMessage, "你也在现场观看吗");
  assert.equal(replyRequired.latestUserMessage, null);
  assert.match(replyRequired.modelInput, /唯一回复目标：左侧客户的最近消息“你也在现场观看吗”/);
  assert.doesNotMatch(replyRequired.modelInput, /正在等待左侧客户的新回复/);

  const shortCustomerReply = buildAdminIngestWechatGroundingRequest({
    input: "请根据这张微信对话截图输出完整正文。",
    attachments: [{
      extractedText: [
        "【微信对话截图识别稿】",
        "客户(左侧)：这段较早的客户长句不应成为当前回复目标",
        "我(右侧)：那您最近感觉怎么样",
        "客户(左侧)：还好",
        "",
        "【固定角色规则】",
        "从截图底部向上识别到的最近客户消息：这段较早的客户长句不应成为当前回复目标"
      ].join("\n"),
      pageSummaries: ["最近客户消息：这段较早的客户长句不应成为当前回复目标"],
      wechatOutputMode: "full_answer"
    }]
  });

  assert.equal(shortCustomerReply.currentTurnState, "reply_required");
  assert.equal(shortCustomerReply.latestCustomerMessage, "还好");
  assert.match(shortCustomerReply.query, /^客户最近消息：还好/m);
  assert.match(shortCustomerReply.query, /客户：还好/);
  assert.match(shortCustomerReply.modelInput, /唯一回复目标：左侧客户的最近消息“还好”/);
  assert.doesNotMatch(shortCustomerReply.modelInput, /唯一回复目标：.*较早的客户长句/);

  const insufficientShortTail = buildAdminIngestWechatGroundingRequest({
    input: "请根据这张微信对话截图输出完整正文。",
    attachments: [{
      extractedText: [
        "【微信对话截图识别稿】",
        "客户(左侧)：这段旧长句绝不能被回退为当前回复目标",
        "我(右侧)：您现在感觉怎么样",
        "客户(左侧)：嗯",
        "",
        "【固定角色规则】",
        "从截图底部向上识别到的最近客户消息：这段旧长句绝不能被回退为当前回复目标"
      ].join("\n"),
      pageSummaries: ["最近客户消息：这段旧长句绝不能被回退为当前回复目标"],
      wechatOutputMode: "full_answer"
    }]
  });

  assert.equal(insufficientShortTail.currentTurnState, "reply_required");
  assert.equal(insufficientShortTail.latestCustomerMessage, "嗯");
  assert.equal(insufficientShortTail.latestUserMessage, null);
  assert.match(insufficientShortTail.query, /^客户最近消息：嗯/m);
  assert.match(insufficientShortTail.query, /客户：嗯/);
  assert.match(insufficientShortTail.modelInput, /唯一回复目标：左侧客户的最近消息“嗯”/);
  assert.doesNotMatch(insufficientShortTail.modelInput, /唯一回复目标：.*这段旧长句/);

  const missingStructuredTail = buildAdminIngestWechatGroundingRequest({
    input: "请根据这张微信对话截图输出完整正文。",
    attachments: [{
      extractedText: [
        "【微信对话截图识别稿】",
        "",
        "【固定角色规则】",
        "从截图底部向上识别到的最近客户消息：这条摘要不能替代结构化角色证据"
      ].join("\n"),
      pageSummaries: ["最近客户消息：这条摘要不能替代结构化角色证据"],
      wechatOutputMode: "full_answer"
    }]
  });

  assert.equal(missingStructuredTail.currentTurnState, "evidence_insufficient");
  assert.equal(missingStructuredTail.latestCustomerMessage, null);
  assert.equal(missingStructuredTail.latestUserMessage, null);
  assert.match(missingStructuredTail.query, /底部最后一条有效消息证据不足/);
  assert.doesNotMatch(missingStructuredTail.query, /这条摘要/);
  assert.match(missingStructuredTail.modelInput, /当前回合证据不足/);
  assert.doesNotMatch(missingStructuredTail.modelInput, /这条摘要/);

  const unreliableStructuredTail = buildAdminIngestWechatGroundingRequest({
    input: "请根据这张微信对话截图输出完整正文。",
    attachments: [{
      extractedText: [
        "【微信对话截图识别稿】",
        "客户(左侧)：这条更早消息不能被回退为目标",
        "客户(右侧)：角色与左右侧证据冲突",
        "",
        "【固定角色规则】",
        "从截图底部向上识别到的最近客户消息：这条更早消息不能被回退为目标"
      ].join("\n"),
      pageSummaries: ["最近客户消息：这条更早消息不能被回退为目标"],
      wechatOutputMode: "full_answer"
    }]
  });

  assert.equal(unreliableStructuredTail.currentTurnState, "evidence_insufficient");
  assert.equal(unreliableStructuredTail.latestCustomerMessage, null);
  assert.doesNotMatch(unreliableStructuredTail.query, /这条更早消息/);
  assert.match(unreliableStructuredTail.modelInput, /当前回合证据不足/);

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
