import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import {
  buildAdminIngestWechatReplyEvidence
} from "../lib/enterprise/ingest-wechat-transcript";
import {
  buildAdminIngestWechatGroundingRequest
} from "../lib/enterprise/admin-ingest-wechat-grounding";
const moduleLoader = Module as unknown as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleLoader._load;
moduleLoader._load = (request, parent, isMain) => request === "server-only"
  ? {}
  : originalLoad(request, parent, isMain);
const {
  ADMIN_INGEST_IMAGE_OCR_PIPELINE_VERSION,
  calculateAdminIngestWechatTailPrimaryHeight,
  parseAdminIngestFile,
  resolveAdminIngestWechatVisionTailRole
} = require("../lib/enterprise/ingest-file-parser") as typeof import("../lib/enterprise/ingest-file-parser");
const {
  buildAdminIngestOcrCacheKey,
  clearAdminIngestOcrCache,
  readAdminIngestOcrCache,
  writeAdminIngestOcrCache
} = require("../lib/enterprise/admin-ingest-ocr-cache") as typeof import("../lib/enterprise/admin-ingest-ocr-cache");
moduleLoader._load = originalLoad;

const visionMislabelledTail = [
  "客户(左侧)：我儿子、孙子都很喜欢打篮球",
  "客户(左侧)：你也在现场观看吗"
].join("\n");
const localGeometryTail = [
  "客户(左侧)：我儿子、孙子都很喜欢打篮球",
  "我(右侧)：你也在现场观看吗"
].join("\n");

function buildGrounding(extractedText: string) {
  return buildAdminIngestWechatGroundingRequest({
    input: "请根据这张微信对话截图输出完整正文。",
    attachments: [{
      extractedText,
      pageSummaries: [],
      wechatOutputMode: "full_answer"
    }]
  });
}

async function main() {
  clearAdminIngestOcrCache();

  const parserSource = readFileSync(
    new URL("../lib/enterprise/ingest-file-parser.ts", import.meta.url),
    "utf8"
  );

  assert.match(parserSource, /const \[visionResult, initialTailRoleOutcome\] = await Promise\.all/);
  assert.match(parserSource, /resolveAdminIngestWechatVisionTailRole\(\{/);
  assert.match(parserSource, /localRoleReliable: tailRoleResult\?\.roleReliable === true/);
  assert.match(parserSource, /tailRoleResult\?\.tailRoleEvidence/);
  assert.match(parserSource, /tailRoleResult\?\.strictTailTranscript/);
  assert.match(parserSource, /tailRoleResult\?\.strictTailRoleEvidence/);
  assert.match(parserSource, /tailRoleVerificationPolicy/);
  assert.match(parserSource, /currentTurnRoleInsufficient/);
  assert.match(parserSource, /admin-ingest-image-ocr-v5-focused-tail-role/);
  assert.match(parserSource, /prepareWechatTailRoleVerificationBuffers/);
  assert.match(parserSource, /hasReliableFocusedWechatTailRole/);
  assert.match(parserSource, /legacy_bottom_fallback_v1/);
  assert.match(parserSource, /shouldRestoreLegacyLocalContext/);
  assert.match(parserSource, /tailRoleCropStrategy/);
  assert.match(parserSource, /visionTailHash/);
  assert.match(parserSource, /localTailHash/);
  assert.match(parserSource, /bestScoreBucket/);
  assert.match(parserSource, /filteredTailComposerChromeCount/);
  assert.match(parserSource, /admin_ingest\.wechat_tail_role_input/);
  assert.match(parserSource, /VISION_PROVIDER_FAILED/);
  assert.match(parserSource, /VISION_TEXT_EMPTY/);
  assert.match(parserSource, /VISION_ROLE_FORMAT_UNPARSEABLE/);
  assert.match(
    parserSource,
    /const \[visionResult, initialTailRoleOutcome\] = await Promise\.all\([\s\S]*?if \(input\.signal\) \{\s*throwIfAborted\(input\.signal\);\s*\}/
  );
  assert.match(
    parserSource,
    /input\.signal\?\.aborted[\s\S]*?throw createAbortError\(input\.signal\)/
  );
  assert.equal(calculateAdminIngestWechatTailPrimaryHeight(2_388), 955);
  assert.equal(calculateAdminIngestWechatTailPrimaryHeight(13_063), 4_200);
  assert.equal(calculateAdminIngestWechatTailPrimaryHeight(800), 800);

  const pollutedViewerTailResolution = resolveAdminIngestWechatVisionTailRole({
    visionText: [
      "我(右侧)：你都做了一年多了，团队现在应该挺大的吧？",
      "客户(左侧)：一般般"
    ].join("\n"),
    localTranscript: [
      "我(右侧)：你都做了一年多了，团队现在应该挺大的吧？",
      "客户(左侧)：一股般",
      "我(右侧)：查看器"
    ].join("\n"),
    localRoleReliable: true
  });
  assert.equal(pollutedViewerTailResolution.currentTurnState, "evidence_insufficient");

  const focusedBubbleTailResolution = resolveAdminIngestWechatVisionTailRole({
    visionText: [
      "客户(左侧)：十年挖一口井，也不要一年挖十口井",
      "我(右侧)：说得太好了，深耕一件事，时间自然会给出答案",
      "我(右侧)：你都做了一年多了，团队现在应该挺大的吧？",
      "客户(左侧)：一般般"
    ].join("\n"),
    localTranscript: [
      "我(右侧)：你都做了一年多了，团队现在应该挺大的吧？",
      "客户(左侧)：一般般"
    ].join("\n"),
    localRoleReliable: true,
    localTailEvidence: {
      confidence: 96,
      roleSource: "color",
      isLowestNonNoiseEvidence: true
    }
  });
  assert.equal(focusedBubbleTailResolution.currentTurnState, "reply_required");
  assert.equal(focusedBubbleTailResolution.tailRole, "customer");
  assert.equal(focusedBubbleTailResolution.transcript.messages.length, 4);
  assert.equal(focusedBubbleTailResolution.transcript.messages.at(-1)?.text, "一般般");
  assert.match(
    focusedBubbleTailResolution.transcript.transcript,
    /客户\(左侧\)：十年挖一口井，也不要一年挖十口井/
  );

  const coldResolution = resolveAdminIngestWechatVisionTailRole({
    visionText: visionMislabelledTail,
    localTranscript: localGeometryTail,
    localRoleReliable: true
  });

  assert.equal(coldResolution.currentTurnState, "waiting_for_customer");
  assert.equal(coldResolution.tailRole, "user");
  assert.match(coldResolution.transcript.transcript, /我\(右侧\)：你也在现场观看吗$/);
  assert.match(coldResolution.textHash ?? "", /^[a-f0-9]{16}$/);

  const strictResolution = resolveAdminIngestWechatVisionTailRole({
    visionText: visionMislabelledTail,
    localTranscript: localGeometryTail,
    localRoleReliable: false,
    policy: "tail_strict",
    localTailEvidence: {
      confidence: 88,
      roleSource: "color",
      isLowestNonNoiseEvidence: true
    }
  });
  assert.equal(strictResolution.currentTurnState, "waiting_for_customer");
  assert.equal(strictResolution.verification.diagnostics.policy, "tail_strict");
  assert.equal(strictResolution.verification.diagnostics.reason, "VERIFIED");
  assert.match(strictResolution.localTailTextHash ?? "", /^[a-f0-9]{16}$/);

  const localOnlyWaitingResolution = resolveAdminIngestWechatVisionTailRole({
    visionText: "云视觉没有输出可解析的角色结构",
    localTranscript: [
      "客户(左侧)：我儿子、孙子都很喜欢打篮球",
      "我(右侧)：你也在现场观看吗"
    ].join("\n"),
    localRoleReliable: true
  });
  assert.equal(localOnlyWaitingResolution.currentTurnState, "waiting_for_customer");
  assert.equal(localOnlyWaitingResolution.tailRole, "user");
  assert.match(localOnlyWaitingResolution.transcript.transcript, /我\(右侧\)：你也在现场观看吗$/);

  const localOnlyReplyResolution = resolveAdminIngestWechatVisionTailRole({
    visionText: "云视觉没有输出可解析的角色结构",
    localTranscript: [
      "我(右侧)：最近睡眠怎么样？",
      "客户(左侧)：还是经常醒"
    ].join("\n"),
    localRoleReliable: true
  });
  assert.equal(localOnlyReplyResolution.currentTurnState, "reply_required");
  assert.equal(localOnlyReplyResolution.tailRole, "customer");
  assert.equal(localOnlyReplyResolution.transcript.latestCustomerMessage, "还是经常醒");

  const unreliableLocalOnlyResolution = resolveAdminIngestWechatVisionTailRole({
    visionText: "云视觉没有输出可解析的角色结构",
    localTranscript: "我(右侧)：你也在现场观看吗",
    localRoleReliable: false
  });
  assert.equal(unreliableLocalOnlyResolution.currentTurnState, "evidence_insufficient");
  assert.equal(unreliableLocalOnlyResolution.tailRole, "uncertain");

  const providerFailedStrictResolution = resolveAdminIngestWechatVisionTailRole({
    visionText: "",
    localTranscript: localGeometryTail,
    localRoleReliable: true,
    policy: "tail_strict",
    localTailEvidence: {
      confidence: 91,
      roleSource: "color",
      isLowestNonNoiseEvidence: true
    },
    visionMissingReason: "VISION_PROVIDER_FAILED"
  });
  assert.equal(providerFailedStrictResolution.currentTurnState, "evidence_insufficient");
  assert.equal(
    providerFailedStrictResolution.verification.diagnostics.reason,
    "VISION_PROVIDER_FAILED"
  );

  const emptyVisionStrictResolution = resolveAdminIngestWechatVisionTailRole({
    visionText: "",
    localTranscript: localGeometryTail,
    localRoleReliable: true,
    policy: "tail_strict",
    localTailEvidence: {
      confidence: 91,
      roleSource: "color",
      isLowestNonNoiseEvidence: true
    },
    visionMissingReason: "VISION_TEXT_EMPTY"
  });
  assert.equal(emptyVisionStrictResolution.currentTurnState, "evidence_insufficient");
  assert.equal(
    emptyVisionStrictResolution.verification.diagnostics.reason,
    "VISION_TEXT_EMPTY"
  );

  const unparseableVisionStrictResolution = resolveAdminIngestWechatVisionTailRole({
    visionText: "云视觉返回了自由文本，但没有明确左右角色标签。",
    localTranscript: localGeometryTail,
    localRoleReliable: true,
    policy: "tail_strict",
    localTailEvidence: {
      confidence: 91,
      roleSource: "color",
      isLowestNonNoiseEvidence: true
    },
    visionMissingReason: "VISION_ROLE_FORMAT_UNPARSEABLE"
  });
  assert.equal(unparseableVisionStrictResolution.currentTurnState, "evidence_insufficient");
  assert.equal(
    unparseableVisionStrictResolution.verification.diagnostics.reason,
    "VISION_ROLE_FORMAT_UNPARSEABLE"
  );

  const markdownFormattedVisionStrictResolution = resolveAdminIngestWechatVisionTailRole({
    visionText: [
      "- **客户(左侧)：** 我儿子、孙子都很喜欢打篮球",
      "2. **我（右侧）**：你也在现场观看吗"
    ].join("\n"),
    localTranscript: localGeometryTail,
    localRoleReliable: true,
    policy: "tail_strict",
    localTailEvidence: {
      confidence: 91,
      roleSource: "color",
      isLowestNonNoiseEvidence: true
    }
  });
  assert.equal(markdownFormattedVisionStrictResolution.currentTurnState, "waiting_for_customer");
  assert.equal(markdownFormattedVisionStrictResolution.tailRole, "user");

  const verifiedEvidence = buildAdminIngestWechatReplyEvidence({
    transcript: coldResolution.transcript.transcript,
    latestCustomerMessage: coldResolution.transcript.latestCustomerMessage,
    currentTurnRoleVerification: "verified"
  });
  const verifiedGrounding = buildGrounding(verifiedEvidence);

  assert.equal(verifiedGrounding.currentTurnState, "waiting_for_customer");
  assert.equal(verifiedGrounding.latestUserMessage, "你也在现场观看吗");
  assert.doesNotMatch(verifiedGrounding.modelInput, /唯一回复目标/);

  const imageBytes = Buffer.from("same-real-image-fixture");
  const v3StrictKey = buildAdminIngestOcrCacheKey({
    accountScope: "account-a",
    bytes: imageBytes,
    variant: "wechat:full_answer:tail_strict",
    pipelineVersion: ADMIN_INGEST_IMAGE_OCR_PIPELINE_VERSION
  });
  const v3GlobalKey = buildAdminIngestOcrCacheKey({
    accountScope: "account-a",
    bytes: imageBytes,
    variant: "wechat:full_answer:global",
    pipelineVersion: ADMIN_INGEST_IMAGE_OCR_PIPELINE_VERSION
  });
  const staleV1Key = buildAdminIngestOcrCacheKey({
    accountScope: "account-a",
    bytes: imageBytes,
    variant: "wechat:full_answer:tail_strict",
    pipelineVersion: "admin-ingest-image-ocr-v1"
  });

  assert.equal(readAdminIngestOcrCache(v3StrictKey), null);
  writeAdminIngestOcrCache(v3StrictKey, verifiedEvidence);
  assert.equal(readAdminIngestOcrCache(v3StrictKey), verifiedEvidence);
  assert.equal(readAdminIngestOcrCache(v3GlobalKey), null);
  assert.equal(readAdminIngestOcrCache(staleV1Key), null);
  assert.notEqual(v3StrictKey, v3GlobalKey);
  assert.notEqual(v3StrictKey, staleV1Key);

  const unmatchedResolution = resolveAdminIngestWechatVisionTailRole({
    visionText: visionMislabelledTail,
    localTranscript: "我(右侧)：无法与视觉尾句匹配的文字",
    localRoleReliable: true
  });

  assert.equal(unmatchedResolution.currentTurnState, "evidence_insufficient");
  assert.equal(unmatchedResolution.tailRole, "uncertain");

  const insufficientEvidence = buildAdminIngestWechatReplyEvidence({
    transcript: unmatchedResolution.transcript.transcript,
    latestCustomerMessage: unmatchedResolution.transcript.latestCustomerMessage,
    currentTurnRoleVerification: "insufficient"
  });
  const insufficientGrounding = buildGrounding(insufficientEvidence);

  assert.match(insufficientEvidence, /【当前回合角色核验】证据不足/);
  assert.equal(insufficientGrounding.currentTurnState, "evidence_insufficient");
  assert.equal(insufficientGrounding.latestCustomerMessage, null);
  assert.doesNotMatch(insufficientGrounding.modelInput, /唯一回复目标/);

  const abortedImageBytes = Buffer.from("aborted-image-must-not-be-cached");
  const abortedCacheKey = buildAdminIngestOcrCacheKey({
    accountScope: "account-aborted",
    bytes: abortedImageBytes,
    variant: "wechat:full_answer:tail_strict",
    pipelineVersion: ADMIN_INGEST_IMAGE_OCR_PIPELINE_VERSION
  });
  const abortController = new AbortController();
  abortController.abort(new DOMException("cancelled by parser test", "AbortError"));

  await assert.rejects(
    parseAdminIngestFile({
      fileName: "aborted.jpg",
      mimeType: "image/jpeg",
      sizeBytes: abortedImageBytes.byteLength,
      buffer: abortedImageBytes,
      recognitionMode: "wechat_conversation",
      wechatOutputMode: "full_answer",
      tailRoleVerificationPolicy: "tail_strict",
      cacheAccountScope: "account-aborted",
      signal: abortController.signal
    }),
    (error: unknown) => error instanceof Error && error.name === "AbortError"
  );
  assert.equal(readAdminIngestOcrCache(abortedCacheKey), null);

  clearAdminIngestOcrCache();
  console.log("Admin ingest WeChat tail-role parser tests passed.");
}

void main().catch((error) => {
  clearAdminIngestOcrCache();
  console.error(error);
  process.exitCode = 1;
});
