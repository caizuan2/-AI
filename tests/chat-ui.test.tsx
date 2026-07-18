import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  askChat,
  changeCurrentUserPassword,
  fetchConversationHistory,
  fetchConversations,
  fetchQuickActionCategories,
  uploadChatAttachment,
  updateCurrentUserAvatar,
  USER_CHAT_LOGIN_URL
} from "../app/(user)/chat-ui/api";
import {
  appendAskResult,
  createAskAttachmentPayload,
  createAskRequestPayload,
  createNewChatState,
  createUserMessage,
  formatChatUserAccountForDisplay,
  getChatUserAvatarStorageKey,
  getCurrentChatUserAccount,
  getCurrentChatUserAvatarUrl,
  getCurrentChatUserDisplayAccount,
  getCurrentChatUserDisplayName,
  getCachedChatAttachmentPreviewUrl,
  normalizeCurrentChatUserAvatarUrl,
  normalizeChatMode
} from "../app/(user)/chat-ui/chat-ui-state";
import {
  AVATAR_MAX_SIZE_BYTES,
  AvatarSettingsDialog,
  validateAvatarFile
} from "../app/(user)/chat-ui/components/AvatarSettingsDialog";
import {
  CHAT_FILE_ACCEPT,
  ChatInput,
  createChatAttachmentFromFile,
  removeChatAttachment,
  SelectedAttachmentList,
  validateChatAttachmentFile
} from "../app/(user)/chat-ui/components/ChatInput";
import { ChatShell } from "../app/(user)/chat-ui/components/ChatShell";
import {
  ChatMessages,
  copyUserMessageToClipboard,
  getAttachmentPreviewUrls,
  getUserMessageCopyText
} from "../app/(user)/chat-ui/components/ChatMessages";
import { ChatQuickActions } from "../app/(user)/chat-ui/components/ChatQuickActions";
import {
  ChatSettingsMenu,
  SwitchAccountConfirmDialog
} from "../app/(user)/chat-ui/components/ChatSettingsMenu";
import {
  isChatUiAuthReady,
  shouldRedirectChatUiAuth
} from "../app/(user)/chat-ui/components/ClientAuthGate";
import { ChatSidebarDrawer } from "../app/(user)/chat-ui/components/ChatSidebarDrawer";
import { ModeToggle } from "../app/(user)/chat-ui/components/ModeToggle";
import { AttachmentMenu } from "../app/(user)/chat-ui/components/AttachmentMenu";
import { KnowledgeBaseSelector } from "../app/(user)/chat-ui/components/KnowledgeBaseSelector";
import { isCareerMentorMessage } from "../app/(user)/app/components/chat/message-renderer";
import {
  extractCareerMentorInlineCopyTargets,
  ProductAnswerView,
  splitNaturalAnswerForCustomerScriptCards
} from "../app/(user)/chat-ui/components/ProductAnswerView";
import {
  CustomerAnswerCard,
  copyCustomerAnswerToClipboard
} from "../app/(user)/chat-ui/components/CustomerAnswerCard";
import { copyAnswerSectionToClipboard } from "../app/(user)/chat-ui/components/AnswerSectionCard";
import {
  buildRichAnswerSections,
  splitCustomerAnswerParagraphs
} from "../app/(user)/chat-ui/lib/answer-format";
import { buildRagPromptMessages, type RagContext } from "../lib/ai/rag-prompt";
import { cleanUserFacingRagAnswer } from "../lib/ai/rag-output";
import {
  finalizeUserAnswer,
  formatFinalizedAnswerForDisplay
} from "../lib/ai-chat/response-finalizer";
import { normalizeUserChatMarkdown } from "../lib/ai-chat/user-chat-markdown";

async function main() {
  const messageBase = {
    id: "scope-check",
    role: "assistant" as const,
    content: "回答正文",
    created_at: "2026-07-14T00:00:00.000Z"
  };

  assert.equal(isCareerMentorMessage({
    ...messageBase,
    metadata: {
      knowledgeSelection: {
        agentId: "expert-career",
        knowledgeBaseId: "kb-business-coach"
      }
    }
  }), true);
  assert.equal(isCareerMentorMessage({
    ...messageBase,
    metadata: {
      knowledgeSelection: {
        agentId: "expert-kks",
        knowledgeBaseId: "kb-kks-slim"
      }
    }
  }), false);
  assert.equal(isCareerMentorMessage({
    ...messageBase,
    metadata: {
      knowledgeSelection: {
        agentId: "expert-health",
        knowledgeBaseId: "kb-business-coach"
      }
    }
  }), false);
  assert.equal(isCareerMentorMessage({
    ...messageBase,
    metadata: {
      knowledgeSelection: {
        agentId: "expert-career",
        knowledgeBaseId: "kb-kks-slim"
      }
    }
  }), false);

  const naturalCustomerScriptAnswer = [
    "好的，我先保留完整分析。这类场景重点不是马上替伙伴下结论，而是先让他把客户画像、当前动作和真正卡住的点说清楚。",
    "如果一开始只给一个很泛的答案，伙伴拿去对客户沟通时会缺少抓手，所以回答里需要保留判断逻辑、提问顺序和可直接复制的沟通话术。",
    "下面这段就是在完整正文里额外标出一段可直接给客户使用的话术，正文其他部分仍然照常展示。",
    "",
    "话术一（通用版）：",
    "收到。您先把客户的基本情况说一下，我再帮您组织更稳妥的回复。比如客户现在最担心的是安全性、效果，还是使用周期，我会根据这个点来给您一段更贴合的回复。",
    "",
    "使用前建议：",
    "不要直接承诺结果，先确认客户最关心的问题，再根据对方回复决定下一步怎么讲。"
  ].join("\n");
  const naturalScriptSegments = splitNaturalAnswerForCustomerScriptCards(naturalCustomerScriptAnswer);

  assert.equal(naturalScriptSegments.some((segment) => segment.kind === "customerScript"), true);

  const naturalScriptMarkup = renderToStaticMarkup(
    <ProductAnswerView
      answer={{
        title: "小董AI",
        rawContent: naturalCustomerScriptAnswer,
        problemUnderstanding: "",
        keyConclusion: "",
        suggestedSteps: [],
        customerReply: "",
        nextAction: ""
      }}
      rawAnswerText={naturalCustomerScriptAnswer}
      sources={[]}
    />
  );

  assert.match(naturalScriptMarkup, /复制答案/);
  assert.match(naturalScriptMarkup, /复制话术/);
  assert.match(naturalScriptMarkup, /话术一（通用版）/);
  assert.match(naturalScriptMarkup, /收到。您先把客户的基本情况说一下/);
  assert.match(naturalScriptMarkup, /使用前建议/);

  const careerMentorGroundingFallback = [
    "## 可复制给客户",
    "",
    "本轮没有检索到可逐字核对的同阶段客户话术。请补充客户原话、当前阶段或对应资料后再生成。"
  ].join("\n");
  const careerMentorFallbackSegments = splitNaturalAnswerForCustomerScriptCards(
    careerMentorGroundingFallback,
    { careerMentorMode: true }
  );

  assert.equal(careerMentorFallbackSegments.some((segment) => segment.kind === "customerScript"), false);
  assert.match(careerMentorFallbackSegments[0]?.text ?? "", /本轮没有检索到可逐字核对的同阶段客户话术/);
  assert.doesNotMatch(careerMentorFallbackSegments[0]?.text ?? "", /## 可复制给客户\s+客户话术$/);

  const careerMentorIngestPassthroughAnswer = [
    "## 核心判断",
    "宝妈破冰的关键不是讲事业，而是让她感觉‘你懂我’。",
    "",
    "## 一线可复制破冰话术（可直接用）",
    "",
    "### 场景：朋友圈看到宝妈吐槽带娃累",
    "",
    "> “看到你这条真的特别有共鸣。有时候真不是身体累，是心里空。你有这种感觉吗？”",
    "",
    "**原理**：先共情，再过渡。对方点头了，再往下走。",
    "",
    "---",
    "",
    "### 场景：宝妈表达‘觉得自己没用’",
    "",
    "> “不是你没用，是带娃这件事没人看见、没人打分。其实你比你自己以为的厉害得多。”",
    "",
    "**原理**：肯定价值，但不马上推事业。",
    "",
    "---",
    "",
    "### 场景：宝妈主动问‘你在做什么’",
    "",
    "> “我最近在研究一件事，特别适合像你这样又想兼顾孩子、又不想把自己弄丢的妈妈。你要是感兴趣，我可以和你聊聊。”",
    "",
    "**原理**：讲状态改变，降低防御。",
    "",
    "## 破冰时的 3 个安全边界",
    "后续完整正文继续保留。"
  ].join("\n");
  const careerMentorInlineCopyTargets = extractCareerMentorInlineCopyTargets(
    careerMentorIngestPassthroughAnswer
  );

  assert.equal(careerMentorInlineCopyTargets.length, 3);
  assert.deepEqual(
    careerMentorInlineCopyTargets.map((target) => target.title),
    [
      "场景：朋友圈看到宝妈吐槽带娃累",
      "场景：宝妈表达‘觉得自己没用’",
      "场景：宝妈主动问‘你在做什么’"
    ]
  );
  assert.equal(careerMentorInlineCopyTargets.every((target) => target.variant === "careerKnowledge"), true);
  assert.match(careerMentorInlineCopyTargets[0]?.text ?? "", /看到你这条真的特别有共鸣/);
  assert.equal(careerMentorInlineCopyTargets.some((target) => /原理|先共情|肯定价值|降低防御/.test(target.text)), false);

  const careerMentorIngestPassthroughMarkup = renderToStaticMarkup(
    <ProductAnswerView
      answer={{
        title: "讲事业导师",
        rawContent: careerMentorIngestPassthroughAnswer,
        problemUnderstanding: "",
        keyConclusion: "",
        suggestedSteps: [],
        customerReply: "",
        nextAction: ""
      }}
      rawAnswerText={careerMentorIngestPassthroughAnswer}
      sources={[]}
      careerMentorMode
    />
  );

  assert.equal((careerMentorIngestPassthroughMarkup.match(/data-inline-copy="career-mentor"/g) ?? []).length, 3);
  assert.equal((careerMentorIngestPassthroughMarkup.match(/data-script-origin="career-knowledge"/g) ?? []).length, 3);
  assert.equal((careerMentorIngestPassthroughMarkup.match(/复制话术/g) ?? []).length, 3);
  assert.match(careerMentorIngestPassthroughMarkup, /一线可复制破冰话术（可直接用）/);
  assert.match(careerMentorIngestPassthroughMarkup, /“看到你这条真的特别有共鸣。.*你有这种感觉吗？”/);
  assert.match(careerMentorIngestPassthroughMarkup, /原理/);
  assert.match(careerMentorIngestPassthroughMarkup, /先共情，再过渡/);
  assert.match(careerMentorIngestPassthroughMarkup, /后续完整正文继续保留/);
  assert.ok(
    careerMentorIngestPassthroughMarkup.indexOf("一线可复制破冰话术（可直接用）")
      < careerMentorIngestPassthroughMarkup.indexOf("看到你这条真的特别有共鸣")
  );
  assert.ok(
    careerMentorIngestPassthroughMarkup.indexOf("看到你这条真的特别有共鸣")
      < careerMentorIngestPassthroughMarkup.indexOf("先共情，再过渡")
  );

  const liveCareerFollowUpAnswer = [
    "## 可以直接复制的话术模板",
    "",
    "下面这些话术是帮你‘无压跟进’的，不用背，感受一下里面的分寸就行。",
    "",
    "### 第一次跟进（破冰后 1-2 天）",
    "> 姐，昨天晚上我理东西，看到上次跟你提的那个方向的时候，突然想到一个点——其实很多人不是不接受机会，是怕‘又要重头开始’。",
    "> 而这个东西妙就妙在，它不需要你重新开始，只是在你原有的基础上加一条路。你啥时候有空，我两分钟把这点讲明白，你就当多听一个思路，不做也没事。",
    "",
    "### 客户看了资料但没下文",
    "> 哥，上次发你的文件，你不用急着看完整。我今天刚好跟一个做了三个月的朋友聊，他说了一句话我觉得特别经典。",
    "> 你要是有兴趣，我可以把那个朋友的故事讲给你听听，就三五分钟，比你单看资料有画面感多了。",
    "",
    "### 客户说‘我看看’之后沉默",
    "> 姐，没消息就是还在琢磨，我觉得挺好的，说明你认真。",
    "> 我刚好看到一组数据，这跟你上次说到的担心挺像的。你要是想聊聊，我随时在，不聊业务，就聊趋势。",
    "",
    "**重点是：每次出现都带着一点点新鲜信息，但绝不催。**",
    "",
    "## 跟进节奏参考",
    "这里继续保留完整的原始正文。"
  ].join("\n");
  const liveCareerFollowUpTargets = extractCareerMentorInlineCopyTargets(liveCareerFollowUpAnswer);

  assert.equal(liveCareerFollowUpTargets.length, 3);
  assert.deepEqual(
    liveCareerFollowUpTargets.map((target) => target.title),
    [
      "第一次跟进（破冰后 1-2 天）",
      "客户看了资料但没下文",
      "客户说‘我看看’之后沉默"
    ]
  );
  assert.equal(liveCareerFollowUpTargets.every((target) => target.nodeKind === "blockquote"), true);
  assert.deepEqual(
    liveCareerFollowUpTargets.map((target) => target.text),
    [
      "姐，昨天晚上我理东西，看到上次跟你提的那个方向的时候，突然想到一个点——其实很多人不是不接受机会，是怕‘又要重头开始’。\n而这个东西妙就妙在，它不需要你重新开始，只是在你原有的基础上加一条路。你啥时候有空，我两分钟把这点讲明白，你就当多听一个思路，不做也没事。",
      "哥，上次发你的文件，你不用急着看完整。我今天刚好跟一个做了三个月的朋友聊，他说了一句话我觉得特别经典。\n你要是有兴趣，我可以把那个朋友的故事讲给你听听，就三五分钟，比你单看资料有画面感多了。",
      "姐，没消息就是还在琢磨，我觉得挺好的，说明你认真。\n我刚好看到一组数据，这跟你上次说到的担心挺像的。你要是想聊聊，我随时在，不聊业务，就聊趋势。"
    ]
  );
  assert.equal(
    liveCareerFollowUpTargets.some((target) => /下面这些话术|不用背|重点是|跟进节奏/.test(target.text)),
    false
  );

  const liveCareerFollowUpMarkup = renderToStaticMarkup(
    <ProductAnswerView
      answer={{
        title: "讲事业导师",
        rawContent: liveCareerFollowUpAnswer,
        problemUnderstanding: "",
        keyConclusion: "",
        suggestedSteps: [],
        customerReply: "",
        nextAction: ""
      }}
      rawAnswerText={liveCareerFollowUpAnswer}
      sources={[]}
      careerMentorMode
    />
  );
  const liveCareerFollowUpVisibleMarkup = liveCareerFollowUpMarkup.replace(
    /<textarea[^>]*>[\s\S]*?<\/textarea>/g,
    ""
  );

  assert.equal((liveCareerFollowUpMarkup.match(/data-inline-copy="career-mentor"/g) ?? []).length, 3);
  assert.equal((liveCareerFollowUpMarkup.match(/data-inline-copy-node="blockquote"/g) ?? []).length, 3);
  assert.equal((liveCareerFollowUpVisibleMarkup.match(/下面这些话术/g) ?? []).length, 1);
  assert.equal((liveCareerFollowUpVisibleMarkup.match(/重点是：每次出现/g) ?? []).length, 1);
  assert.match(liveCareerFollowUpVisibleMarkup, /这里继续保留完整的原始正文/);
  assert.ok(
    liveCareerFollowUpVisibleMarkup.indexOf("下面这些话术")
      < liveCareerFollowUpVisibleMarkup.indexOf("姐，昨天晚上我理东西")
  );
  assert.ok(
    liveCareerFollowUpVisibleMarkup.indexOf("姐，昨天晚上我理东西")
      < liveCareerFollowUpVisibleMarkup.indexOf("跟进节奏参考")
  );
  assert.ok(
    liveCareerFollowUpVisibleMarkup.lastIndexOf("</blockquote>")
      < liveCareerFollowUpVisibleMarkup.indexOf("重点是：每次出现")
  );

  const plainParagraphCareerAnswer = [
    "## 可以直接复制的话术模板",
    "",
    "> 下面这些话术是帮你无压跟进的，不用背，感受一下里面的分寸就行。",
    "",
    "第一次跟进（破冰后 1-2 天）",
    "",
    "姐，我刚好想到你上次提到的那个问题。你有空的时候，我用两分钟把这个思路跟你说清楚，不着急做决定。",
    "",
    "重点是：这是一段使用说明，不应该出现复制按钮。",
    "",
    "## 跟进节奏参考",
    "正文继续保留。"
  ].join("\n");
  const plainParagraphCareerTargets = extractCareerMentorInlineCopyTargets(plainParagraphCareerAnswer);

  assert.equal(plainParagraphCareerTargets.length, 1);
  assert.equal(plainParagraphCareerTargets[0]?.title, "第一次跟进（破冰后 1-2 天）");
  assert.equal(plainParagraphCareerTargets[0]?.nodeKind, "paragraph");
  assert.match(plainParagraphCareerTargets[0]?.text ?? "", /姐，我刚好想到你/);
  assert.doesNotMatch(plainParagraphCareerTargets[0]?.text ?? "", /下面这些话术|重点是/);

  const plainParagraphCareerMarkup = renderToStaticMarkup(
    <ProductAnswerView
      answer={{
        title: "讲事业导师",
        rawContent: plainParagraphCareerAnswer,
        problemUnderstanding: "",
        keyConclusion: "",
        suggestedSteps: [],
        customerReply: "",
        nextAction: ""
      }}
      rawAnswerText={plainParagraphCareerAnswer}
      sources={[]}
      careerMentorMode
    />
  );
  const plainParagraphCareerVisibleMarkup = plainParagraphCareerMarkup.replace(
    /<textarea[^>]*>[\s\S]*?<\/textarea>/g,
    ""
  );

  assert.equal((plainParagraphCareerMarkup.match(/data-inline-copy="career-mentor"/g) ?? []).length, 1);
  assert.match(plainParagraphCareerMarkup, /data-inline-copy-node="paragraph"/);
  assert.equal((plainParagraphCareerVisibleMarkup.match(/下面这些话术/g) ?? []).length, 1);
  assert.equal((plainParagraphCareerVisibleMarkup.match(/重点是：这是一段使用说明/g) ?? []).length, 1);
  assert.equal((plainParagraphCareerVisibleMarkup.match(/姐，我刚好想到你/g) ?? []).length, 1);

  for (const frozenExpertTitle of ["瘦身KKS", "大健康专家"]) {
    const plainParagraphNonCareerMarkup = renderToStaticMarkup(
      <ProductAnswerView
        answer={{
          title: frozenExpertTitle,
          rawContent: plainParagraphCareerAnswer,
          problemUnderstanding: "",
          keyConclusion: "",
          suggestedSteps: [],
          customerReply: "",
          nextAction: ""
        }}
        rawAnswerText={plainParagraphCareerAnswer}
        sources={[]}
      />
    );

    assert.doesNotMatch(
      plainParagraphNonCareerMarkup,
      /data-inline-copy="career-mentor"|data-inline-copy-node="paragraph"/
    );
  }

  const structuredCustomerReply = "姐姐，刚发你的视频你抽空看一下就好。主要是讲宝妈如何兼顾家庭和一份小事业的思路，不用有压力。";
  const naturalAnswerWithoutScript = [
    "判断",
    "当前客户已经收到资料，下一步应先确认是否看过，再用开放式问题收集反馈。",
    "",
    "回复思路",
    "保持轻量跟进，不催促，也不要跳过当前阶段。"
  ].join("\n");
  const sharedNonCareerMarkup = renderToStaticMarkup(
    <ProductAnswerView
      answer={{
        title: "瘦身KKS",
        rawContent: naturalAnswerWithoutScript,
        problemUnderstanding: "",
        keyConclusion: "",
        suggestedSteps: [],
        customerReply: structuredCustomerReply,
        nextAction: ""
      }}
      rawAnswerText={naturalAnswerWithoutScript}
      sources={[]}
    />
  );

  assert.match(sharedNonCareerMarkup, /当前客户已经收到资料/);
  assert.doesNotMatch(sharedNonCareerMarkup, /复制话术|bg-emerald-50\/70/);

  const structuredFallbackMarkup = renderToStaticMarkup(
    <ProductAnswerView
      answer={{
        title: "讲事业导师",
        rawContent: naturalAnswerWithoutScript,
        problemUnderstanding: "",
        keyConclusion: "",
        suggestedSteps: [],
        customerReply: structuredCustomerReply,
        nextAction: ""
      }}
      rawAnswerText={naturalAnswerWithoutScript}
      sources={[]}
      careerMentorMode
    />
  );

  assert.match(structuredFallbackMarkup, /当前客户已经收到资料/);
  assert.match(structuredFallbackMarkup, /保持轻量跟进/);
  assert.match(structuredFallbackMarkup, /可直接复制给客户/);
  assert.match(structuredFallbackMarkup, /复制话术/);
  assert.match(structuredFallbackMarkup, /姐姐，刚发你的视频你抽空看一下就好/);
  assert.match(structuredFallbackMarkup, /data-script-origin="career-knowledge"/);
  assert.match(structuredFallbackMarkup, /border-emerald-200 bg-white shadow-emerald-950\/5/);

  const normalizedDuplicateAnswer = [
    "判断",
    "客户已经收到资料，可以轻量确认反馈。",
    "",
    `姐姐，刚发你的视频，你抽空看一下就好！主要是讲宝妈如何兼顾家庭和一份小事业的思路，不用有压力。`
  ].join("\n");
  const normalizedDuplicateMarkup = renderToStaticMarkup(
    <ProductAnswerView
      answer={{
        title: "讲事业导师",
        rawContent: normalizedDuplicateAnswer,
        problemUnderstanding: "",
        keyConclusion: "",
        suggestedSteps: [],
        customerReply: structuredCustomerReply,
        nextAction: ""
      }}
      rawAnswerText={normalizedDuplicateAnswer}
      sources={[]}
      careerMentorMode
    />
  );

  assert.match(normalizedDuplicateMarkup, /姐姐，刚发你的视频/);
  assert.doesNotMatch(normalizedDuplicateMarkup, /复制话术|bg-emerald-50\/70/);

  const groundedCareerAnswer = [
    "## 判断",
    "当前阶段：第二步促单跟进",
    "",
    "## 回复思路",
    "完整正文继续显示。",
    "",
    "## 可复制给客户",
    "### 话术 1",
    `> ${structuredCustomerReply}`
  ].join("\n");
  const groundedCareerMarkup = renderToStaticMarkup(
    <ProductAnswerView
      answer={{
        title: "讲事业导师",
        rawContent: groundedCareerAnswer,
        problemUnderstanding: "",
        keyConclusion: "",
        suggestedSteps: [],
        customerReply: structuredCustomerReply,
        nextAction: ""
      }}
      rawAnswerText={groundedCareerAnswer}
      sources={[]}
      careerMentorMode
    />
  );

  assert.match(groundedCareerMarkup, /完整正文继续显示/);
  assert.match(groundedCareerMarkup, /复制话术/);
  assert.match(groundedCareerMarkup, /border-emerald-200 bg-white shadow-emerald-950\/5/);

  const adaptiveCareerReply = "姐，资料你先按自己的节奏看，看完告诉我你最想先了解哪一部分，我按你的关注点跟你说。";
  const adaptiveCareerReply2 = "姐，不着急回复我。资料里哪一部分你比较有感觉，或者哪一部分还没看明白？";
  const adaptiveCareerReply3 = "姐，你可以先不用一次看完。你更想先了解具体怎么做，还是时间怎么安排？";
  const dualLayerCareerAnswer = [
    "## 先把这次跟进的目标放对",
    "客户已经收到资料，这时不需要催促。先给她留出阅读空间，再围绕她主动提到的关注点继续。",
    "",
    "## 这次可以怎么推进",
    "完整的自然正文继续显示，并且可以按问题自由组织标题、段落和列表。",
    "",
    "1. 先确认客户是否已经看过资料。",
    "2. 再根据客户反馈推进下一步。",
    "",
    "### AI思考回复话术",
    "",
    "#### AI建议话术 1（稳妥自然型）",
    `> ${adaptiveCareerReply}`,
    "",
    "#### AI建议话术 2（共情引导型）",
    `> ${adaptiveCareerReply2}`,
    "",
    "#### AI建议话术 3（轻问推进型）",
    `> ${adaptiveCareerReply3}`,
    "",
    "## 可复制给客户",
    "",
    "### 话术 1",
    `> ${structuredCustomerReply}`
  ].join("\n");
  const dualLayerSegments = splitNaturalAnswerForCustomerScriptCards(
    dualLayerCareerAnswer,
    { careerMentorMode: true }
  );
  const dualLayerScriptSegments = dualLayerSegments.filter(
    (segment): segment is Extract<(typeof dualLayerSegments)[number], { kind: "customerScript" }> => segment.kind === "customerScript"
  );

  assert.deepEqual(
    dualLayerScriptSegments.map((segment) => segment.variant),
    ["careerAi", "careerAi", "careerAi", "careerKnowledge"]
  );
  assert.deepEqual(
    dualLayerScriptSegments.map((segment) => segment.title),
    [
      "AI建议话术 1（稳妥自然型）",
      "AI建议话术 2（共情引导型）",
      "AI建议话术 3（轻问推进型）",
      "话术 1"
    ]
  );
  assert.deepEqual(
    dualLayerScriptSegments.map((segment) => segment.text),
    [adaptiveCareerReply, adaptiveCareerReply2, adaptiveCareerReply3, structuredCustomerReply]
  );
  assert.equal(dualLayerScriptSegments.some((segment) => segment.text.startsWith(">")), false);

  const dualLayerCareerMarkup = renderToStaticMarkup(
    <ProductAnswerView
      answer={{
        title: "讲事业导师",
        rawContent: dualLayerCareerAnswer,
        problemUnderstanding: "",
        keyConclusion: "",
        suggestedSteps: [],
        customerReply: structuredCustomerReply,
        nextAction: ""
      }}
      rawAnswerText={dualLayerCareerAnswer}
      sources={[]}
      careerMentorMode
    />
  );

  assert.match(dualLayerCareerMarkup, /先把这次跟进的目标放对/);
  assert.match(dualLayerCareerMarkup, /完整的自然正文继续显示/);
  assert.doesNotMatch(dualLayerCareerMarkup, /当前阶段：第二步促单跟进|推荐执行流程/);
  assert.match(dualLayerCareerMarkup, /AI思考回复话术/);
  assert.match(dualLayerCareerMarkup, new RegExp(adaptiveCareerReply));
  assert.match(dualLayerCareerMarkup, new RegExp(adaptiveCareerReply2));
  assert.match(dualLayerCareerMarkup, new RegExp(adaptiveCareerReply3));
  assert.match(dualLayerCareerMarkup, new RegExp(structuredCustomerReply));
  assert.equal((dualLayerCareerMarkup.match(/data-script-origin="career-ai"/g) ?? []).length, 3);
  assert.match(dualLayerCareerMarkup, /border-teal-200 bg-white shadow-teal-950\/5/);
  assert.match(dualLayerCareerMarkup, /data-script-origin="career-knowledge"/);
  assert.match(dualLayerCareerMarkup, /border-emerald-200 bg-white shadow-emerald-950\/5/);
  assert.doesNotMatch(dualLayerCareerMarkup, /bg-teal-50\/70|bg-emerald-50\/70/);
  assert.equal((dualLayerCareerMarkup.match(/复制话术/g) ?? []).length, 4);
  assert.ok(
    dualLayerCareerMarkup.indexOf("data-script-origin=\"career-ai\"")
      < dualLayerCareerMarkup.indexOf("data-script-origin=\"career-knowledge\"")
  );

  const fencedCareerAnswer = [
    "## 判断",
    "当前阶段：第二步促单跟进",
    "",
    "## 回复思路",
    "代码块中的同名标题只是正文示例，不能拆成复制卡片。",
    "",
    "````markdown",
    "```markdown",
    "### AI思考回复话术",
    "#### AI建议话术 1",
    "> 代码块里的示例话术。",
    "可直接复制给客户：“代码块里的内联示例不能成为卡片。”",
    "```",
    "````",
    "",
    "### AI思考回复话术",
    "#### AI建议话术 1（稳妥自然型）",
    `> ${adaptiveCareerReply}`,
    "#### AI建议话术 2（共情引导型）",
    `> ${adaptiveCareerReply2}`,
    "#### AI建议话术 3（轻问推进型）",
    `> ${adaptiveCareerReply3}`,
    "",
    "## 可复制给客户",
    "### 话术 1",
    `> ${structuredCustomerReply}`
  ].join("\n");
  const fencedCareerSegments = splitNaturalAnswerForCustomerScriptCards(
    fencedCareerAnswer,
    { careerMentorMode: true }
  );
  const fencedCareerScriptSegments = fencedCareerSegments.filter(
    (segment): segment is Extract<(typeof fencedCareerSegments)[number], { kind: "customerScript" }> => segment.kind === "customerScript"
  );
  const fencedCareerMarkdown = fencedCareerSegments
    .filter((segment): segment is Extract<(typeof fencedCareerSegments)[number], { kind: "markdown" }> => segment.kind === "markdown")
    .map((segment) => segment.text)
    .join("\n");

  assert.deepEqual(
    fencedCareerScriptSegments.map((segment) => segment.variant),
    ["careerAi", "careerAi", "careerAi", "careerKnowledge"]
  );
  assert.match(
    fencedCareerMarkdown,
    /````markdown[\s\S]*```markdown[\s\S]*### AI思考回复话术[\s\S]*代码块里的示例话术。[\s\S]*代码块里的内联示例不能成为卡片。[\s\S]*```[\s\S]*````/
  );

  const fencedCareerMarkup = renderToStaticMarkup(
    <ProductAnswerView
      answer={{
        title: "讲事业导师",
        rawContent: fencedCareerAnswer,
        problemUnderstanding: "",
        keyConclusion: "",
        suggestedSteps: [],
        customerReply: structuredCustomerReply,
        nextAction: ""
      }}
      rawAnswerText={fencedCareerAnswer}
      sources={[]}
      careerMentorMode
    />
  );

  assert.equal((fencedCareerMarkup.match(/data-script-origin="career-ai"/g) ?? []).length, 3);
  assert.match(fencedCareerMarkup, /代码块里的示例话术。/);
  assert.match(fencedCareerMarkup, /代码块里的内联示例不能成为卡片。/);

  const indentedCareerAnswer = [
    "## 判断",
    "当前阶段：第二步促单跟进",
    "",
    "## 回复思路",
    "四空格缩进代码只属于正文。",
    "",
    "    ### AI思考回复话术",
    "    #### AI建议话术 1",
    "    > 缩进代码里的示例话术不能成为卡片。",
    "",
    "### AI思考回复话术",
    "#### AI建议话术 1（稳妥自然型）",
    `> ${adaptiveCareerReply}`,
    "#### AI建议话术 2（共情引导型）",
    `> ${adaptiveCareerReply2}`,
    "#### AI建议话术 3（轻问推进型）",
    `> ${adaptiveCareerReply3}`,
    "",
    "## 可复制给客户",
    "### 话术 1",
    `> ${structuredCustomerReply}`
  ].join("\n");
  const indentedCareerSegments = splitNaturalAnswerForCustomerScriptCards(
    indentedCareerAnswer,
    { careerMentorMode: true }
  );
  const indentedCareerScriptSegments = indentedCareerSegments.filter(
    (segment): segment is Extract<(typeof indentedCareerSegments)[number], { kind: "customerScript" }> => segment.kind === "customerScript"
  );
  const indentedCareerMarkdown = indentedCareerSegments
    .filter((segment): segment is Extract<(typeof indentedCareerSegments)[number], { kind: "markdown" }> => segment.kind === "markdown")
    .map((segment) => segment.text)
    .join("\n");

  assert.deepEqual(
    indentedCareerScriptSegments.map((segment) => segment.variant),
    ["careerAi", "careerAi", "careerAi", "careerKnowledge"]
  );
  assert.match(
    indentedCareerMarkdown,
    /    ### AI思考回复话术\n    #### AI建议话术 1\n    > 缩进代码里的示例话术不能成为卡片。/
  );

  const legacyPlainSectionSegments = splitNaturalAnswerForCustomerScriptCards([
    "回复思路",
    "AI思考回复话术",
    "话术 1",
    `> ${adaptiveCareerReply}`,
    "可复制给客户（固定知识库话术）",
    "话术 1",
    `> ${structuredCustomerReply}`
  ].join("\n"), { careerMentorMode: true }).filter(
    (segment): segment is Extract<(typeof dualLayerSegments)[number], { kind: "customerScript" }> => segment.kind === "customerScript"
  );

  assert.deepEqual(
    legacyPlainSectionSegments.map((segment) => segment.variant),
    ["careerAi", "careerKnowledge"]
  );

  const adaptiveOnlyCareerAnswer = [
    "## 判断",
    "当前阶段：第二步促单跟进",
    "",
    "## 回复思路",
    "### AI思考回复话术",
    "#### AI建议话术 1（稳妥自然型）",
    `> ${adaptiveCareerReply}`,
    "#### AI建议话术 2（共情引导型）",
    `> ${adaptiveCareerReply2}`,
    "#### AI建议话术 3（轻问推进型）",
    `> ${adaptiveCareerReply3}`
  ].join("\n");
  const adaptiveOnlyCareerMarkup = renderToStaticMarkup(
    <ProductAnswerView
      answer={{
        title: "讲事业导师",
        rawContent: adaptiveOnlyCareerAnswer,
        problemUnderstanding: "",
        keyConclusion: "",
        suggestedSteps: [],
        customerReply: structuredCustomerReply,
        nextAction: ""
      }}
      rawAnswerText={adaptiveOnlyCareerAnswer}
      sources={[]}
      careerMentorMode
    />
  );

  assert.equal((adaptiveOnlyCareerMarkup.match(/data-script-origin="career-ai"/g) ?? []).length, 3);
  assert.match(adaptiveOnlyCareerMarkup, /data-script-origin="career-knowledge"/);
  assert.equal((adaptiveOnlyCareerMarkup.match(/复制话术/g) ?? []).length, 4);

  const nonCareerDualLayerMarkup = renderToStaticMarkup(
    <ProductAnswerView
      answer={{
        title: "瘦身KKS",
        rawContent: dualLayerCareerAnswer,
        problemUnderstanding: "",
        keyConclusion: "",
        suggestedSteps: [],
        customerReply: structuredCustomerReply,
        nextAction: ""
      }}
      rawAnswerText={dualLayerCareerAnswer}
      sources={[]}
    />
  );

  assert.doesNotMatch(nonCareerDualLayerMarkup, /data-script-origin="career-(?:ai|knowledge)"/);
  assert.doesNotMatch(nonCareerDualLayerMarkup, /data-inline-copy="career-mentor"/);
  assert.doesNotMatch(nonCareerDualLayerMarkup, /bg-teal-50\/70|bg-emerald-50\/70/);

  const htmlListAnswer = [
    "第三步｜讲事业通心 + 流程 + 注意事项｜三位一体完成认知建设｜",
    "<ul><li><strong>通心</strong>：唤醒内在动力（如“为什么现在是改变的好时机？”）</li><li><strong>流程</strong>：清晰呈现事业路径（入门→成长→复制→收获）</li><li><strong>注意事项</strong>：提前划清边界，增强可信度</li></ul>",
    "第四步 &amp; 第五步｜锁定问题 + 扎口袋成交。"
  ].join("\n");
  const normalizedHtmlListAnswer = normalizeUserChatMarkdown(htmlListAnswer);

  assert.doesNotMatch(normalizedHtmlListAnswer, /<\/?(?:ul|li|strong|b)>/i);
  assert.match(normalizedHtmlListAnswer, /- \*\*通心\*\*：唤醒内在动力/);
  assert.match(normalizedHtmlListAnswer, /- \*\*流程\*\*：清晰呈现事业路径/);
  assert.match(normalizedHtmlListAnswer, /第四步 & 第五步/);

  const htmlListMarkup = renderToStaticMarkup(
    <ProductAnswerView
      answer={{
        title: "讲事业导师",
        rawContent: htmlListAnswer,
        problemUnderstanding: "",
        keyConclusion: "",
        suggestedSteps: [],
        customerReply: "",
        nextAction: ""
      }}
      rawAnswerText={htmlListAnswer}
      sources={[]}
    />
  );

  assert.doesNotMatch(htmlListMarkup, /&lt;\/?(?:ul|li|strong|b)/i);
  assert.match(htmlListMarkup, /通心/);
  assert.match(htmlListMarkup, /流程/);

  const courseMetadataAnswer = [
    "根据《讲事业导师》知识库中的标准课程结构，“沟通五步骤”是讲事业价值成交体系中的核心方法论。",
    "",
    "✅ 沟通五步骤",
    "| 步骤 | 名称 | 核心目的 |",
    "| 第一步 | 建立信任与需求探询 | 打开对话，识别真实动机 |",
    "| 第二步 | 促单跟进 | 强化兴趣，推动决策节奏 |",
    "",
    "🔍 **依据来源：** 该结构源自《讲事业导师 · T0标准用语替换审计SOP草稿》及多源课程融合规范，明确标注为“沟通五步的思路课程”，并在知识库中按【第一步】至【第四五步】分段定义（见检索文档 pub-1moqfi5 / pub-103efva / pub-1vwo7zx）。",
    "",
    "📌 补充说明",
    "- 这五步不是机械流程，而是以客户为中心的价值交付节奏。"
  ].join("\n");
  const cleanCourseMetadataAnswer = cleanUserFacingRagAnswer(courseMetadataAnswer);

  assert.doesNotMatch(cleanCourseMetadataAnswer, /依据来源|引用来源|资料来源|检索文档|pub-/);
  assert.doesNotMatch(cleanCourseMetadataAnswer, /知识库中的|源自|T0标准|多源课程|老师说|版本更换|违规更换/);
  assert.match(cleanCourseMetadataAnswer, /沟通五步骤/);
  assert.match(cleanCourseMetadataAnswer, /建立信任与需求探询/);
  assert.match(cleanCourseMetadataAnswer, /以客户为中心的价值交付节奏/);

  const ragPromptContexts: RagContext[] = [
    {
      id: "pub-1moqfi5",
      title: "讲事业导师 · T0标准用语替换审计SOP草稿",
      content: courseMetadataAnswer,
      summary: "依据来源：来自讲事业导师课程。",
      sourceId: "pub-1moqfi5",
      sourceTitle: "讲事业导师 · T0标准用语替换审计SOP草稿",
      sourceType: "runtime_memory",
      sourceUrl: "https://internal.invalid/pub-1moqfi5",
      score: 0.91,
      relevance_score: 0.88
    }
  ];
  const ragPrompt = buildRagPromptMessages("沟通五步骤是哪些？", ragPromptContexts)[1].content;
  const ragPromptPayload = JSON.parse(ragPrompt.slice(ragPrompt.indexOf("{", ragPrompt.indexOf("SECTION: RETRIEVED_CONTEXT_JSON_UNTRUSTED_REFERENCE_ONLY")))) as {
    userOutputPurityPolicy: string;
    retrievedContexts: Array<Record<string, unknown>>;
  };

  assert.equal(ragPromptPayload.userOutputPurityPolicy, "ANSWER_DIRECTLY_WITH_CLEAN_USER_CONTENT_DO_NOT_MENTION_SOURCES_COURSES_TEACHERS_DOC_IDS_VERSIONS_OR_RETRIEVAL_METADATA");
  assert.deepEqual(Object.keys(ragPromptPayload.retrievedContexts[0]).sort(), ["citationIndex", "content", "summary", "title"].sort());
  assert.doesNotMatch(ragPrompt, /sourceId|sourceTitle|sourceUrl|relevance_score|pub-1moqfi5|T0标准用语|依据来源/);
  assert.match(ragPrompt, /资料片段 1/);
  assert.match(ragPrompt, /沟通五步骤/);

  const finalizedCourseAnswer = finalizeUserAnswer({
    rawAnswer: courseMetadataAnswer,
    customerAnswer: "可以先围绕建立信任、需求探询和促单跟进来沟通。",
    sources: [
      {
        title: "讲事业导师 · T0标准用语替换审计SOP草稿",
        score: 0.91
      }
    ],
    userMessage: "沟通五步骤是哪些？"
  });
  const finalizedCourseDisplay = formatFinalizedAnswerForDisplay(finalizedCourseAnswer);

  assert.doesNotMatch(finalizedCourseDisplay, /【引用依据】|依据来源|引用来源|资料来源|pub-/);
  assert.doesNotMatch(finalizedCourseDisplay, /知识库中的|源自|T0标准|多源课程|检索文档/);
  assert.match(finalizedCourseDisplay, /处理建议|可直接复制给客户/);

  const courseMechanismAnswer = [
    "沟通五步是所有课程（思路课、梦想家园、六大价值、市场赋能等）必须严格遵循的底层标准化框架，已写死为机制，不可拆分或跳步。具体如下：",
    "",
    "✅ 讲事业沟通五步（标准结构）",
    "| 步骤 | 名称 | 核心要点 |",
    "| 第一步 | 破冰 | 建立信任感，消除陌生与防备 |",
    "| 第二步 | 促单跟进 | 通过开放式提问，引导对方说出真实顾虑 |",
    "| 第三步 | 讲事业通心 + 流程 + 注意事项 | 链接个人梦想、家庭责任和成长渴望 |",
    "| 第四五步 | 锁定问题 + 扎口袋成交 | 聚焦顾虑，推动下一步行动 |",
    "",
    "客户话术",
    "你现在是想先了解这五步怎么用在具体场景里，还是已经有某个沟通卡点，想我们一起拆解？"
  ].join("\n");
  const cleanCourseMechanismAnswer = cleanUserFacingRagAnswer(courseMechanismAnswer);

  assert.doesNotMatch(cleanCourseMechanismAnswer, /所有课程|思路课|梦想家园|六大价值|市场赋能|底层标准化框架|写死|不可拆分|不可跳步|标准结构/);
  assert.match(cleanCourseMechanismAnswer, /沟通五步可以按下面五个阶段理解/);
  assert.match(cleanCourseMechanismAnswer, /讲事业沟通五步/);
  assert.match(cleanCourseMechanismAnswer, /破冰/);
  assert.match(cleanCourseMechanismAnswer, /促单跟进/);
  assert.match(cleanCourseMechanismAnswer, /讲事业通心/);
  assert.match(cleanCourseMechanismAnswer, /扎口袋成交/);

  const courseMechanismPrompt = buildRagPromptMessages("读取知识库沟通五步都是什么", [
    {
      id: "course-mechanism",
      title: "讲事业导师",
      content: courseMechanismAnswer,
      sourceId: "pub-course-mechanism",
      sourceTitle: "讲事业导师课程机制"
    }
  ])[1].content;

  assert.doesNotMatch(courseMechanismPrompt, /所有课程|思路课|梦想家园|六大价值|市场赋能|底层标准化框架|写死|不可拆分|不可跳步|标准结构|pub-course-mechanism/);
  assert.match(courseMechanismPrompt, /沟通五步可以按下面五个阶段理解/);
  assert.match(courseMechanismPrompt, /讲事业沟通五步/);
  assert.match(courseMechanismPrompt, /破冰/);

  const courseMechanismMarkup = renderToStaticMarkup(
    <ProductAnswerView
      answer={{
        title: "讲事业导师",
        rawContent: courseMechanismAnswer,
        problemUnderstanding: "",
        keyConclusion: "",
        suggestedSteps: [],
        customerReply: "",
        nextAction: ""
      }}
      rawAnswerText={courseMechanismAnswer}
      sources={[]}
    />
  );

  assert.doesNotMatch(courseMechanismMarkup, /所有课程|思路课|梦想家园|六大价值|市场赋能|底层标准化框架|写死|不可拆分|不可跳步|标准结构/);
  assert.match(courseMechanismMarkup, /复制答案/);
  assert.match(courseMechanismMarkup, /复制话术/);
  assert.match(courseMechanismMarkup, /沟通五步可以按下面五个阶段理解/);
  assert.match(courseMechanismMarkup, /讲事业沟通五步/);
  assert.match(courseMechanismMarkup, /你现在是想先了解这五步怎么用/);

  const implicitCustomerScriptAnswer = [
    "好的，这个问题很典型。先共情，再指出为什么过去的方法不持久，最后用轻量邀请降低他的压力。",
    "",
    "直接可复制的话术（微信/私聊发送）",
    "第一步：先共情，打开话匣子（不要一上来就推销）",
    "",
    "宝/兄弟，听你试了那么多种减肥方法都没达到想要的效果，我特别能理解那种感觉。节食饿得心慌，运动累得要死，要么反弹，要么坚持不下来，确实太折磨人了。",
    "",
    "第二步：点出本质差别，让他觉得这次可能不一样",
    "",
    "脂达人它的思路不是硬扛，而是先把身体内部的代谢环境调顺了，让你自然瘦。",
    "",
    "💡 给你的沟通要点（话术背后的策略）",
    "1. 关键词要对味：少用“减肥”，多用“调理”“代谢”“轻松”“不反弹”。",
    "2. 制造闭环感：一定要提到反弹，这是所有折腾过的人心里永远的痛。"
  ].join("\n");
  const implicitScriptSegments = splitNaturalAnswerForCustomerScriptCards(implicitCustomerScriptAnswer);
  const implicitScriptCards = implicitScriptSegments.filter((segment) => segment.kind === "customerScript");

  assert.equal(implicitScriptCards.length, 1);
  assert.match(implicitScriptCards[0].text, /宝\/兄弟，听你试了那么多种减肥方法/);
  assert.match(implicitScriptCards[0].text, /脂达人它的思路不是硬扛/);
  assert.doesNotMatch(implicitScriptCards[0].text, /话术背后的策略/);
  assert.equal(
    implicitScriptSegments.some((segment) => segment.kind === "markdown" && /话术背后的策略/.test(segment.text)),
    true
  );
  const implicitScriptMarkup = renderToStaticMarkup(
    <ProductAnswerView
      answer={{
        title: "小董AI",
        rawContent: implicitCustomerScriptAnswer,
        problemUnderstanding: "",
        keyConclusion: "",
        suggestedSteps: [],
        customerReply: "",
        nextAction: ""
      }}
      rawAnswerText={implicitCustomerScriptAnswer}
      sources={[]}
    />
  );

  assert.match(implicitScriptMarkup, /复制话术/);
  assert.match(implicitScriptMarkup, /直接可复制的话术（微信\/私聊发送）/);
  assert.match(implicitScriptMarkup, /宝\/兄弟，听你试了那么多种减肥方法/);
  assert.match(implicitScriptMarkup, /给你的沟通要点/);

  const standaloneQuotedScriptAnswer = [
    "客户用KKS体重下降慢，情绪急躁。这个情况在减脂初期很常见，下面给你一套完整跟进方案。",
    "",
    "一、先快速稳住客户情绪",
    "客户急躁的时候，别急着讲道理，先共情、接住情绪。",
    "",
    "“姐/哥，我特别理解你现在的心情。花钱又花时间，谁不希望快点看到变化对吧？你这样想是正常的，别急，我帮你分析一下为什么这几天体重变化慢，以及接下来怎么调整。” 关键点：",
    "",
    "- 第一时间认可对方感受，不要否定或讲大道理",
    "- 给信心：这个情况我见得多，基本都能解决",
    "- 把问题明确化：我们一起来看看是哪一步需要优化"
  ].join("\n");
  const standaloneQuotedScriptSegments = splitNaturalAnswerForCustomerScriptCards(standaloneQuotedScriptAnswer);
  const standaloneQuotedScriptCards = standaloneQuotedScriptSegments.filter((segment) => segment.kind === "customerScript");

  assert.equal(standaloneQuotedScriptCards.length, 1);
  assert.match(standaloneQuotedScriptCards[0].text, /姐\/哥，我特别理解你现在的心情/);
  assert.equal(
    standaloneQuotedScriptSegments.some((segment) => segment.kind === "markdown" && /关键点/.test(segment.text)),
    true
  );
  const standaloneQuotedScriptMarkup = renderToStaticMarkup(
    <ProductAnswerView
      answer={{
        title: "小董AI",
        rawContent: standaloneQuotedScriptAnswer,
        problemUnderstanding: "",
        keyConclusion: "",
        suggestedSteps: [],
        customerReply: "",
        nextAction: ""
      }}
      rawAnswerText={standaloneQuotedScriptAnswer}
      sources={[]}
    />
  );

  assert.match(standaloneQuotedScriptMarkup, /复制话术/);
  assert.match(standaloneQuotedScriptMarkup, /姐\/哥，我特别理解你现在的心情/);
  assert.match(standaloneQuotedScriptMarkup, /关键点/);

  const coreScriptAnswer = [
    "好的，面对朋友各种减肥方法都没达到想要效果的情况，关键不是直接推产品，而是先接住他的挫败感。",
    "",
    "客户话术",
    "",
    "场景一：理解挫败感，重塑信心",
    "核心话术：",
    "",
    "兄弟/姐妹，我特别懂你说的那种感觉，试了那么多方法，要么饿得头昏眼花，要么累得半死，好不容易瘦了几斤，一停下又反弹了，真的很打击人。",
    "",
    "这个话术为什么有效：",
    "- 共情优先，先承认他的痛苦是真的。",
    "- 把问题从意志力转到方法不对。",
    "",
    "场景二：用效果和安全说话",
    "核心话术：",
    "",
    "我跟你说个实话，如果只是让你换一种药丸吃，我肯定不会推荐给你，因为那只是换汤不换药。"
  ].join("\n");
  const coreScriptSegments = splitNaturalAnswerForCustomerScriptCards(coreScriptAnswer);
  const coreScriptCards = coreScriptSegments.filter((segment) => segment.kind === "customerScript");

  assert.equal(coreScriptCards.length, 2);
  assert.match(coreScriptCards[0].text, /兄弟\/姐妹，我特别懂你说的那种感觉/);
  assert.doesNotMatch(coreScriptCards[0].text, /这个话术为什么有效/);
  assert.match(coreScriptCards[1].text, /如果只是让你换一种药丸吃/);
  assert.equal(
    coreScriptSegments.some((segment) => segment.kind === "markdown" && /这个话术为什么有效/.test(segment.text)),
    true
  );

  const proseLeadScriptAnswer = [
    "准备好一个或者几个案例最有效。如果他认识故事里的人，可信度会翻倍。可以这样说：",
    "",
    "我有好几个朋友刚开始也是你这种想法，觉得我都试过这么多了，肯定没用。但他们抱着最后试试的心态，跟着我们调整了饮食结构和生活习惯，没有节食，也没有疯狂运动。第一个月就干净地掉了8-10斤，而且最关键的是，他们是看着自己肚子下降，腰围小一圈，整个人状态好了很多。",
    "",
    "你的下一步行动",
    "你可以直接复制上面这段，看看他的反应。"
  ].join("\n");
  const proseLeadScriptSegments = splitNaturalAnswerForCustomerScriptCards(proseLeadScriptAnswer);
  const proseLeadScriptCards = proseLeadScriptSegments.filter((segment) => segment.kind === "customerScript");

  assert.equal(proseLeadScriptCards.length, 1);
  assert.match(proseLeadScriptCards[0].text, /我有好几个朋友刚开始也是你这种想法/);
  assert.doesNotMatch(proseLeadScriptCards[0].text, /你的下一步行动/);
  assert.equal(
    proseLeadScriptSegments.some((segment) => segment.kind === "markdown" && /你的下一步行动/.test(segment.text)),
    true
  );
  const proseLeadScriptMarkup = renderToStaticMarkup(
    <ProductAnswerView
      answer={{
        title: "小董AI",
        rawContent: proseLeadScriptAnswer,
        problemUnderstanding: "",
        keyConclusion: "",
        suggestedSteps: [],
        customerReply: "",
        nextAction: ""
      }}
      rawAnswerText={proseLeadScriptAnswer}
      sources={[]}
    />
  );

  assert.match(proseLeadScriptMarkup, /复制话术/);
  assert.match(proseLeadScriptMarkup, /我有好几个朋友刚开始也是你这种想法/);
  assert.match(proseLeadScriptMarkup, /你的下一步行动/);

  const inlineLabeledScriptAnswer = [
    "这个问题很典型。客户真正担心的是安全感和刻板印象。",
    "",
    "✅ 标准回应要点（可直接发给客户）：“完全不用饿肚子！KKS不是节食，而是通过营养重组和代谢调整来优化身体对能量的利用。很多客户反馈，吃够了反而不馋了，肚子也不咕咕叫了。”",
    "",
    "为什么这么说？依据来自KKS体系里对节食、断食和极低热量方案的区分。"
  ].join("\n");
  const inlineLabeledScriptSegments = splitNaturalAnswerForCustomerScriptCards(inlineLabeledScriptAnswer);
  const inlineLabeledScriptCards = inlineLabeledScriptSegments.filter((segment) => segment.kind === "customerScript");

  assert.equal(inlineLabeledScriptCards.length, 1);
  assert.match(inlineLabeledScriptCards[0].title, /标准回应要点/);
  assert.match(inlineLabeledScriptCards[0].text, /完全不用饿肚子/);
  assert.equal(
    inlineLabeledScriptSegments.some((segment) => segment.kind === "markdown" && /为什么这么说/.test(segment.text)),
    true
  );

  const preciseReferenceScriptAnswer = [
    "✅ 动作2：勾起好奇心，让ta主动想来聊",
    "客户看完资料后，ta可能已经产生兴趣，但不知道该怎么开口。你可以主动抛一个低门槛、有价值感的问题，让ta觉得“这个人在认真帮我”。",
    "",
    "话术",
    "参考（跟进 + 价值感）：",
    "“视频里提到的不囤货、不用辞职的模式，其实很多宝妈做起来之后一个月能多出几千到上万的零花钱。我身边就有几个真实案例，你要是看完觉得有意思，我可以具体说说她们是怎么开始的。”",
    "• 核心技巧：用“真实案例”具体说“创造悬念”，让客户产生“想继续听”的冲动。"
  ].join("\n");
  const preciseReferenceScriptSegments = splitNaturalAnswerForCustomerScriptCards(preciseReferenceScriptAnswer);
  const preciseReferenceScriptCards = preciseReferenceScriptSegments.filter((segment) => segment.kind === "customerScript");

  assert.equal(preciseReferenceScriptCards.length, 1);
  assert.match(preciseReferenceScriptCards[0].text, /视频里提到的不囤货/);
  assert.doesNotMatch(preciseReferenceScriptCards[0].text, /参考|核心技巧|真实案例”具体说/);
  assert.equal(
    preciseReferenceScriptSegments.some((segment) => segment.kind === "markdown" && /核心技巧/.test(segment.text)),
    true
  );

  const splitNumberedScriptAnswer = [
    "四、如果你现在要发给客户的完整话术（直接复制可用）",
    "",
    "第1条（资料发完后，当晚或第二天发）：“姐姐，刚发你的视频你抽空看一下就好。主要是讲宝妈如何兼顾家庭和一份小事业的思路，不用有压力。看完有啥想法随便问我。” 第2条（如果ta回复了或你主动跟进）：“视频里提到的不囤货、不用辞职的模式，其实很多宝妈做起来之后一个月多个几千到上万的零花钱很常见。我身边就有几个真实案例，你要是看完觉得有意思，我可以具体说说她们是怎么开始的。” 第3条（如果ta说没或没回，直接约时间）：“我约你大概20分钟，我帮你把视频里的重点过一遍，再结合你的情况看看这个事能不能做、怎么做，比你自己研究有效率多了。你看明天上午还是下午方便？”"
  ].join("\n");
  const splitNumberedScriptSegments = splitNaturalAnswerForCustomerScriptCards(splitNumberedScriptAnswer);
  const splitNumberedScriptCards = splitNumberedScriptSegments.filter((segment) => segment.kind === "customerScript");

  assert.equal(splitNumberedScriptCards.length, 3);
  assert.match(splitNumberedScriptCards[0].title, /第1条/);
  assert.match(splitNumberedScriptCards[0].text, /刚发你的视频/);
  assert.doesNotMatch(splitNumberedScriptCards[0].text, /第2条|第3条/);
  assert.match(splitNumberedScriptCards[1].text, /不囤货、不用辞职/);
  assert.doesNotMatch(splitNumberedScriptCards[1].text, /第1条|第3条/);
  assert.match(splitNumberedScriptCards[2].text, /我约你大概20分钟/);
  assert.doesNotMatch(splitNumberedScriptCards[2].text, /第1条|第2条/);

  const globalPreciseScriptAnswer = [
    "方案A：先肯定对方资源，再提出你的渠道价值。",
    "",
    "话术",
    "模板：X总，看您这边是源头直供，资源确实不错。我们这边也有一批稳定的终端代理和经销商，一直想找这种一手资源对接。想请教下，针对我们渠道这边的合作，除了供货价，有没有专门的扶持政策？方便的话发个合作方案我先看看？",
    "",
    "• 核心作用：一句话就把角色反转——你不是求着买货的，你是他有价值的资源方。方案B：通过问“门槛”来降低对方的预期。",
    "• 思路：不拒绝，但明确告诉他“我们不走零售逻辑”。通过问门槛，让对方意识到你不是散户，需要拿出诚意。",
    "",
    "话术",
    "模板：X总，您那边主要做批发的话，合作门槛和结算方式是什么样的？我们这边拿货量相对稳定，但需要先明确合作规则，才好往下对接。",
    "",
    "• 核心作用：让话题从“你买不买”变成“你门槛是什么”，掌控对话节奏。方案C：拖着，先加好友再聊。",
    "• 思路：不深入，不拒绝，先建联，后面用生活化内容慢慢养。",
    "",
    "客户话术",
    "1. 如果对方给了方案/报价：别说“价格高了”或“折扣不够”。你要回：“方案我仔细看了，整体不错。有几个细节我整理一下，下次跟您细聊。”——目的是进入“细节商讨”阶段，而不是“价格辩论”阶段。",
    "",
    "2. 如果对方没回：2-3天后，别发“在吗/考虑得怎么样”，发一段生活视频，配一句：“刚忙完，X总，您上次说的那个XX产品，我帮朋友问一下，还有吗？”——用生活内容和具体需求双重破冰。提醒你的伙伴一句话：对付这类上游业务，你的价值不在于你多懂产品，而在于你手上有没有终端客户资源。"
  ].join("\n");
  const globalPreciseScriptSegments = splitNaturalAnswerForCustomerScriptCards(globalPreciseScriptAnswer);
  const globalPreciseScriptCards = globalPreciseScriptSegments.filter((segment) => segment.kind === "customerScript");
  const globalPreciseScriptCardText = globalPreciseScriptCards.map((segment) => segment.text).join("\n\n");

  assert.equal(globalPreciseScriptCards.length, 4);
  assert.match(globalPreciseScriptCards[0].text, /^X总，看您这边是源头直供/);
  assert.doesNotMatch(globalPreciseScriptCards[0].text, /模板|核心作用|思路|方案B|方案C/);
  assert.match(globalPreciseScriptCards[1].text, /^X总，您那边主要做批发的话/);
  assert.match(globalPreciseScriptCards[2].text, /方案我仔细看了，整体不错/);
  assert.match(globalPreciseScriptCards[3].text, /刚忙完，X总/);
  assert.doesNotMatch(globalPreciseScriptCardText, /核心作用|思路|方案B|方案C|目的是|价格辩论|细节商讨|提醒你的伙伴/);
  assert.equal(
    globalPreciseScriptSegments.some((segment) => segment.kind === "markdown" && /核心作用/.test(segment.text)),
    true
  );
  assert.equal(
    globalPreciseScriptSegments.some((segment) => segment.kind === "markdown" && /提醒你的伙伴/.test(segment.text)),
    true
  );

  const chatUiPageSource = readFileSync("app/(user)/chat-ui/page.tsx", "utf8");

  assert.match(chatUiPageSource, /<ClientAuthGate>/);
  assert.match(chatUiPageSource, /<ChatShell \/>/);

  const shellMarkup = renderToStaticMarkup(<ChatShell />);

  assert.match(shellMarkup, /Hi，我是你的沟通助手/);
  assert.match(shellMarkup, /打开历史会话/);
  assert.match(shellMarkup, /新建对话/);
  assert.doesNotMatch(shellMarkup, /语音输入/);
  assert.match(shellMarkup, /打开上传菜单/);
  assert.match(shellMarkup, /aria-label="选择专家知识库"/);
  assert.match(shellMarkup, /问问 小董AI/);
  assert.doesNotMatch(shellMarkup, /aria-label="打开相机"/);
  assert.doesNotMatch(shellMarkup, /11:54/);
  assert.doesNotMatch(shellMarkup, /⌁/);
  assert.doesNotMatch(shellMarkup, /麦克风权限未开启/);
  const chatShellSource = readFileSync("app/(user)/chat-ui/components/ChatShell.tsx", "utf8");

  assert.match(
    chatShellSource,
    /<KnowledgeBaseSelector[\s\S]*?onOpen=\{\(\) => setExpertMarketOpen\(true\)\}/
  );
  assert.match(chatShellSource, /open=\{expertMarketOpen\}/);
  assert.match(chatShellSource, /已打开扫描入口/);
  assert.match(chatShellSource, /已选择扫描图片/);
  assert.match(chatShellSource, /已打开通知面板/);
  assert.match(chatShellSource, /historyRequestIdRef/);
  assert.match(chatShellSource, /setConversationId\(nextConversationId\)/);
  assert.match(chatShellSource, /fetchConversationHistory\(nextConversationId,\s*\{/);
  assert.match(chatShellSource, /mergeConversationHistoryWithRun\(\{/);
  assert.match(chatShellSource, /setMessages\(mergedHistory\.messages\)/);
  assert.match(chatShellSource, /uploadChatAttachments\(attachments\)/);
  assert.ok(
    chatShellSource.indexOf("uploadChatAttachments(attachments)") < chatShellSource.indexOf("askChatStream({")
  );
  assert.match(chatShellSource, /IMAGE_ONLY_DEFAULT_PROMPT/);
  assert.match(chatShellSource, /const canSubmit = Boolean\(text\) \|\| hasImageAttachment/);
  assert.match(chatShellSource, /const askText = text \|\| IMAGE_ONLY_DEFAULT_PROMPT/);
  assert.match(chatShellSource, /text: askText/);
  assert.match(chatShellSource, /createUserMessage\(text, attachments\)/);
  assert.doesNotMatch(chatShellSource, /文件上传失败，请重新选择后再发送/);
  assert.doesNotMatch(chatShellSource, /请先输入问题，再随问题一起发送附件/);
  assert.match(chatShellSource, /askControllerByRequestIdRef/);
  assert.match(chatShellSource, /createDraftConversationId\(requestId\)/);
  assert.match(chatShellSource, /updateConversationRunMessages\(requestId/);
  assert.match(chatShellSource, /activeConversationIdRef\.current === sourceViewId/);
  assert.match(chatShellSource, /messages=\{visibleMessages\}/);
  assert.match(chatShellSource, /setInput\(text\)/);
  assert.match(chatShellSource, /content: message\.content \|\| requestErrorMessage/);
  assert.match(chatShellSource, /provider_status: "error" as const/);
  assert.match(chatShellSource, /正在加载历史记录/);
  assert.match(chatShellSource, /该会话暂无消息/);
  assert.match(chatShellSource, /historyLoadError/);
  assert.match(chatShellSource, /PINNED_CONVERSATION_CLOUD_MIGRATION_SUFFIX = "cloud-migrated-v1"/);
  assert.match(chatShellSource, /MAX_PINNED_CONVERSATIONS = 100/);
  assert.match(chatShellSource, /conversation\.pinned === true/);
  assert.doesNotMatch(chatShellSource, /Promise\.allSettled\(\s*migrationCandidateIds/);
  assert.match(chatShellSource, /for \(const targetConversationId of migrationCandidateIds\)/);
  assert.match(chatShellSource, /localOnlyPinnedIds\.slice\(0, availablePinSlots\)/);
  assert.match(chatShellSource, /isConversationActionTerminalPinMigrationError/);
  assert.match(chatShellSource, /updateConversationPin\(targetConversationId, pinned\)/);
  assert.match(chatShellSource, /confirmedPinnedConversationIdsRef/);
  assert.match(chatShellSource, /activeUserIdentityRef\.current !== actionUserIdentity/);
  assert.doesNotMatch(chatShellSource, /availableConversationIds\.has/);
  assert.match(chatShellSource, /保存失败，已恢复原状态/);
  assert.match(chatShellSource, /conversationListRequestIdRef/);
  assert.match(chatShellSource, /conversationListAbortRef/);
  assert.match(chatShellSource, /conversationListInFlightRef/);
  assert.match(chatShellSource, /window\.addEventListener\("online", recoverConversationList\)/);
  assert.match(chatShellSource, /window\.addEventListener\("pageshow", recoverConversationList\)/);
  assert.match(chatShellSource, /document\.addEventListener\("visibilitychange", handleConversationListVisibilityChange\)/);
  assert.match(chatShellSource, /window\.removeEventListener\("online", recoverConversationList\)/);
  assert.match(chatShellSource, /loadConversations\(\{ background: true, force: true \}\)/);
  assert.match(chatShellSource, /conversationListAbortRef\.current\?\.abort\(\)/);
  const selectConversationSource = chatShellSource.slice(
    chatShellSource.indexOf("async function handleSelectConversation"),
    chatShellSource.indexOf("function handleNewChat")
  );
  const newChatSource = chatShellSource.slice(
    chatShellSource.indexOf("function handleNewChat"),
    chatShellSource.indexOf("function setActionInfo")
  );

  assert.doesNotMatch(selectConversationSource, /askControllerByRequestIdRef/);
  assert.doesNotMatch(newChatSource, /askControllerByRequestIdRef/);
  assert.match(chatShellSource, /function abortActiveAsk[\s\S]*?activeController\.abort\(\)/);

  const quickActionsMarkup = renderToStaticMarkup(
    <ChatQuickActions
      mode="expert"
      enableDeepThinking
      enableWebSearch={false}
      quickActions={[
        {
          id: "category-after-sales",
          label: "售后",
          prompt: "售后",
          kind: "category"
        },
        {
          id: "category-enterprise",
          label: "企业服务",
          prompt: "企业服务",
          kind: "category"
        }
      ]}
      onModeChange={() => undefined}
      onToggleDeepThinking={() => undefined}
      onToggleWebSearch={() => undefined}
    />
  );

  assert.equal(quickActionsMarkup, "");

  const fallbackQuickActionsMarkup = renderToStaticMarkup(
    <ChatQuickActions
      mode="fast"
      enableDeepThinking={false}
      enableWebSearch={false}
      onModeChange={() => undefined}
      onToggleDeepThinking={() => undefined}
      onToggleWebSearch={() => undefined}
    />
  );

  assert.equal(fallbackQuickActionsMarkup, "");

  const drawerMarkup = renderToStaticMarkup(
    <ChatSidebarDrawer
      conversations={[]}
      activeConversationId={null}
      open
      loading={false}
      currentUser={{
        id: "user_1",
        name: "蔡姑",
        phone: "+8613360587600",
        licenseActivated: true
      }}
      userName="蔡姑"
      userDescription="13360587600"
      onClose={() => undefined}
      onNewChat={() => undefined}
      onSelect={() => undefined}
    />
  );

  assert.match(drawerMarkup, /搜索/);
  assert.match(drawerMarkup, /小董AI/);
  assert.match(drawerMarkup, /暂无历史会话/);
  assert.match(drawerMarkup, /扫描内容/);
  assert.match(drawerMarkup, /消息/);
  assert.match(drawerMarkup, /设置/);
  assert.match(drawerMarkup, /蔡姑/);
  assert.match(drawerMarkup, /13360587600/);
  assert.doesNotMatch(drawerMarkup, /\+8613360587600/);
  assert.match(drawerMarkup, /修改头像/);
  assert.doesNotMatch(drawerMarkup, /账号[:：]/);
  assert.equal(formatChatUserAccountForDisplay("+8613360587600"), "13360587600");
  assert.equal(formatChatUserAccountForDisplay("user@example.com"), "user@example.com");
  assert.equal(getCurrentChatUserDisplayAccount({
    id: "user_1",
    phone: "+8613360587600",
    licenseActivated: true
  }), "13360587600");

  const drawerSource = readFileSync("app/(user)/chat-ui/components/ChatSidebarDrawer.tsx", "utf8");

  assert.match(drawerSource, /暂无通知/);
  assert.match(drawerSource, /暂无匹配会话/);
  assert.match(drawerSource, /capture="environment"/);
  assert.match(drawerSource, /onScanFileSelected/);
  assert.match(drawerSource, /<Check className=/);
  assert.match(drawerSource, /formatConversationTime\(item\.updatedAt\)/);
  assert.match(drawerSource, /key=\{item\.id\}/);
  assert.match(drawerSource, /onSelect\(item\.id\)/);
  assert.match(drawerSource, /const active = item\.id === activeConversationId/);
  assert.match(drawerSource, /loading && items\.length === 0/);
  assert.match(drawerSource, /runPhase === "uploading" \|\| runPhase === "generating"/);
  assert.match(drawerSource, /!item\.mock && !item\.draft && !item\.generating/);
  assert.doesNotMatch(drawerSource, /setActiveConversationId|selectedConversationId/);

  const activeDrawerMarkup = renderToStaticMarkup(
    <ChatSidebarDrawer
      conversations={[
        {
          id: "conv_1",
          title: "第一条历史",
          mode: "fast",
          metadata: null,
          message_count: 1,
          created_at: "2026-06-01T08:00:00.000Z",
          updated_at: "2026-06-01T08:00:00.000Z"
        },
        {
          id: "conv_2",
          title: "第二条历史",
          mode: "expert",
          metadata: null,
          message_count: 1,
          created_at: "2026-06-01T09:00:00.000Z",
          updated_at: "2026-06-01T09:00:00.000Z"
        }
      ]}
      activeConversationId="conv_2"
      open
      loading={false}
      currentUser={null}
      userName="蔡姑"
      userDescription="13360587600"
      onClose={() => undefined}
      onNewChat={() => undefined}
      onSelect={() => undefined}
    />
  );

  assert.match(activeDrawerMarkup, /第二条历史/);
  assert.match(activeDrawerMarkup, /border-blue-200 bg-blue-50/);
  assert.match(activeDrawerMarkup, /lucide-check/);

  const refreshingDrawerMarkup = renderToStaticMarkup(
    <ChatSidebarDrawer
      conversations={[
        {
          id: "conv_refreshing",
          title: "后台刷新仍保留的历史",
          mode: "fast",
          metadata: null,
          message_count: 2,
          created_at: "2026-07-14T09:00:00.000Z",
          updated_at: "2026-07-14T09:01:00.000Z"
        }
      ]}
      activeConversationId={null}
      open
      loading
      currentUser={null}
      userName="蔡姑"
      userDescription="13360587600"
      onClose={() => undefined}
      onNewChat={() => undefined}
      onSelect={() => undefined}
    />
  );

  assert.match(refreshingDrawerMarkup, /后台刷新仍保留的历史/);
  assert.doesNotMatch(refreshingDrawerMarkup, /animate-pulse/);

  const initialLoadingDrawerMarkup = renderToStaticMarkup(
    <ChatSidebarDrawer
      conversations={[]}
      activeConversationId={null}
      open
      loading
      currentUser={null}
      userName="蔡姑"
      userDescription="13360587600"
      onClose={() => undefined}
      onNewChat={() => undefined}
      onSelect={() => undefined}
    />
  );

  assert.match(initialLoadingDrawerMarkup, /animate-pulse/);

  const staleDrawerWithErrorMarkup = renderToStaticMarkup(
    <ChatSidebarDrawer
      conversations={[
        {
          id: "conv_stale",
          title: "失败时保留的历史",
          mode: "expert",
          metadata: null,
          message_count: 3,
          created_at: "2026-07-14T10:00:00.000Z",
          updated_at: "2026-07-14T10:01:00.000Z"
        }
      ]}
      activeConversationId={null}
      open
      loading={false}
      loadError="历史会话暂时无法加载，请稍后重试。"
      currentUser={null}
      userName="蔡姑"
      userDescription="13360587600"
      onClose={() => undefined}
      onNewChat={() => undefined}
      onSelect={() => undefined}
      onRetryLoad={() => undefined}
    />
  );

  assert.match(staleDrawerWithErrorMarkup, /失败时保留的历史/);
  assert.match(staleDrawerWithErrorMarkup, /历史会话暂时无法加载/);
  assert.match(staleDrawerWithErrorMarkup, /aria-label="重试加载历史会话"/);

  const pinnedDrawerMarkup = renderToStaticMarkup(
    <ChatSidebarDrawer
      conversations={[
        {
          id: "conv_recent",
          title: "最近普通会话",
          mode: "fast",
          metadata: null,
          message_count: 1,
          created_at: "2026-07-16T09:00:00.000Z",
          updated_at: "2026-07-16T09:00:00.000Z"
        },
        {
          id: "conv_pinned",
          title: "云端置顶会话",
          mode: "fast",
          metadata: null,
          pinned: true,
          pinned_at: "2026-07-16T08:00:00.000Z",
          message_count: 1,
          created_at: "2026-06-01T08:00:00.000Z",
          updated_at: "2026-06-01T08:00:00.000Z"
        }
      ]}
      pinnedConversationIds={["conv_pinned"]}
      activeConversationId={null}
      open
      loading={false}
      currentUser={null}
      userName="蔡姑"
      userDescription="13360587600"
      onClose={() => undefined}
      onNewChat={() => undefined}
      onSelect={() => undefined}
    />
  );

  assert.match(pinnedDrawerMarkup, /已置顶/);
  assert.match(pinnedDrawerMarkup, /云端置顶会话/);
  assert.match(pinnedDrawerMarkup, /最近普通会话/);
  assert.ok(pinnedDrawerMarkup.indexOf("已置顶") < pinnedDrawerMarkup.indexOf("最近普通会话"));

  const drawerWithAvatarMarkup = renderToStaticMarkup(
    <ChatSidebarDrawer
      conversations={[]}
      activeConversationId={null}
      open
      loading={false}
      currentUser={{
        id: "user_1",
        name: "蔡姑",
        phone: "+8613360587600",
        avatar_url: "/uploads/avatars/user_1.png",
        licenseActivated: true
      }}
      userName="蔡姑"
      userDescription="13360587600"
      avatarUrl="/uploads/avatars/user_1.png"
      onClose={() => undefined}
      onNewChat={() => undefined}
      onSelect={() => undefined}
    />
  );

  assert.match(drawerWithAvatarMarkup, /src="\/uploads\/avatars\/user_1\.png"/);
  assert.doesNotMatch(drawerWithAvatarMarkup, />用</);

  const avatarDialogMarkup = renderToStaticMarkup(
    <AvatarSettingsDialog
      open
      user={{
        id: "user_1",
        name: "蔡姑",
        phone: "+8613360587600",
        licenseActivated: true
      }}
      userName="蔡姑"
      userAccount="13360587600"
      avatarUrl={null}
      onClose={() => undefined}
      onSaved={() => undefined}
    />
  );

  assert.match(avatarDialogMarkup, /当前头像预览/);
  assert.match(avatarDialogMarkup, /上传新头像/);
  assert.match(avatarDialogMarkup, /恢复默认头像/);
  assert.match(avatarDialogMarkup, /保存/);
  assert.match(avatarDialogMarkup, /取消/);

  const settingsMarkup = renderToStaticMarkup(
    <ChatSettingsMenu
      open
      userName="蔡姑"
      userAccount="13360587600"
      onOpenAvatar={() => undefined}
      onLogout={() => undefined}
      onChangePassword={() => undefined}
      onSwitchAccount={() => undefined}
    />
  );

  assert.match(settingsMarkup, /账号信息/);
  assert.match(settingsMarkup, /蔡姑/);
  assert.match(settingsMarkup, /13360587600/);
  assert.match(settingsMarkup, /修改头像/);
  assert.match(settingsMarkup, /退出登录/);
  assert.match(settingsMarkup, /修改密码/);
  assert.match(settingsMarkup, /切换账号/);
  assert.doesNotMatch(settingsMarkup, /使用其他账号登录/);
  const switchAccountDialogMarkup = renderToStaticMarkup(
    <SwitchAccountConfirmDialog
      open
      account="13360587600"
      onCancel={() => undefined}
      onConfirm={() => undefined}
    />
  );

  assert.match(switchAccountDialogMarkup, /切换账号/);
  assert.match(switchAccountDialogMarkup, /当前账号：13360587600/);
  assert.match(switchAccountDialogMarkup, /使用其他账号登录/);
  assert.match(switchAccountDialogMarkup, /取消/);
  const settingsSource = readFileSync("app/(user)/chat-ui/components/ChatSettingsMenu.tsx", "utf8");

  assert.match(settingsSource, /setSwitchAccountOpen\(true\)/);
  assert.match(settingsSource, /onConfirm=\{\(\) => \{/);
  assert.match(settingsSource, /onSwitchAccount\?\.\(\)/);
  assert.match(settingsSource, /onClick=\{onLogout\}/);
  assert.ok(settingsSource.indexOf("setSwitchAccountOpen(true)") < settingsSource.indexOf("onSwitchAccount?.()"));
  assert.equal(USER_CHAT_LOGIN_URL, "/login?app=user&next=/app");
  assert.equal(isChatUiAuthReady(200), true);
  assert.equal(isChatUiAuthReady(204), true);
  assert.equal(shouldRedirectChatUiAuth(401), true);
  assert.equal(shouldRedirectChatUiAuth(500), false);
  const authGateSource = readFileSync("app/(user)/chat-ui/components/ClientAuthGate.tsx", "utf8");

  assert.match(authGateSource, /fetch\("\/api\/auth\/me"/);
  assert.match(authGateSource, /router\.replace\(USER_CHAT_LOGIN_URL\)/);
  assert.match(authGateSource, /网络异常，请稍后重试/);
  assert.match(authGateSource, /正在检查登录状态/);

  const attachmentMenuMarkup = renderToStaticMarkup(<AttachmentMenu open />);

  assert.match(attachmentMenuMarkup, /aria-label="相机"/);
  assert.match(attachmentMenuMarkup, /aria-label="照片"/);
  assert.match(attachmentMenuMarkup, /aria-label="文件"/);
  assert.match(attachmentMenuMarkup, /rounded-\[28px\]/);
  assert.doesNotMatch(attachmentMenuMarkup, /上传入口/);
  assert.doesNotMatch(attachmentMenuMarkup, /上传手机照片|上传文件|打开相机/);
  assert.doesNotMatch(attachmentMenuMarkup, /从相册选择图片|选择文档或图片|拍摄一张照片/);
  assert.doesNotMatch(attachmentMenuMarkup, /占位/);

  let selectorOpenCount = 0;
  const knowledgeBaseSelector = KnowledgeBaseSelector({
    selectedCount: 0,
    activeTitle: null,
    open: false,
    onOpen: () => {
      selectorOpenCount += 1;
    }
  });
  const knowledgeBaseSelectorMarkup = renderToStaticMarkup(knowledgeBaseSelector);

  assert.equal(knowledgeBaseSelector.props.type, "button");
  knowledgeBaseSelector.props.onClick();
  assert.equal(selectorOpenCount, 1);
  let touchDefaultPrevented = false;
  knowledgeBaseSelector.props.onTouchEnd({
    preventDefault: () => {
      touchDefaultPrevented = true;
    }
  });
  assert.equal(touchDefaultPrevented, true);
  assert.equal(selectorOpenCount, 2);
  assert.match(knowledgeBaseSelectorMarkup, /aria-label="选择专家知识库"/);
  assert.match(knowledgeBaseSelectorMarkup, /aria-haspopup="dialog"/);
  assert.match(knowledgeBaseSelectorMarkup, /aria-expanded="false"/);
  assert.match(knowledgeBaseSelectorMarkup, /class="[^"]*\bh-12\b/);
  assert.match(knowledgeBaseSelectorMarkup, /class="[^"]*\bw-12\b/);
  assert.match(knowledgeBaseSelectorMarkup, /touch-manipulation/);
  assert.match(knowledgeBaseSelectorMarkup, /pointer-events-auto/);
  assert.match(knowledgeBaseSelectorMarkup, /active:scale-95/);

  const expertMarketDrawerSource = readFileSync(
    "app/(user)/chat-ui/components/ExpertMarketDrawer.tsx",
    "utf8"
  );
  assert.match(expertMarketDrawerSource, /createPortal\(/);
  assert.match(expertMarketDrawerSource, /document\.body/);
  assert.match(expertMarketDrawerSource, /role="dialog"/);
  assert.match(expertMarketDrawerSource, /aria-modal="true"/);
  assert.match(expertMarketDrawerSource, /bg-slate-950\/20/);
  assert.match(expertMarketDrawerSource, /safe-area-inset-bottom/);
  assert.match(expertMarketDrawerSource, /bottom-24/);
  assert.match(expertMarketDrawerSource, /h-\[42vh\]/);

  const nextConfigSource = readFileSync("next.config.mjs", "utf8");
  assert.match(nextConfigSource, /source: "\/app\/chat"/);
  assert.match(nextConfigSource, /source: "\/app\/chat\/:path\*"/);
  assert.match(nextConfigSource, /private, no-store, no-cache, max-age=0, must-revalidate/);
  assert.doesNotMatch(nextConfigSource, /source: "\/ingest/);
  assert.doesNotMatch(nextConfigSource, /source: "\/admin/);

  const chatInputMarkup = renderToStaticMarkup(
    <ChatInput
      value=""
      loading={false}
      onValueChange={() => undefined}
      onSubmit={() => undefined}
      onStatusMessage={() => undefined}
      knowledgeBaseSelector={knowledgeBaseSelector}
    />
  );

  assert.match(chatInputMarkup, /accept="image\/\*"/);
  assert.match(chatInputMarkup, new RegExp(`accept="${CHAT_FILE_ACCEPT.replace(/\*/g, "\\*").replace(/\./g, "\\.")}"`));
  assert.match(chatInputMarkup, /multiple=""/);
  assert.match(chatInputMarkup, /capture="environment"/);
  assert.match(chatInputMarkup, /aria-label="打开上传菜单"/);
  assert.match(chatInputMarkup, /aria-label="选择专家知识库"/);
  assert.match(chatInputMarkup, /aria-label="发送消息"/);
  assert.ok(chatInputMarkup.indexOf('aria-label="打开上传菜单"') < chatInputMarkup.indexOf('aria-label="选择专家知识库"'));
  assert.ok(chatInputMarkup.indexOf('aria-label="选择专家知识库"') < chatInputMarkup.indexOf('aria-label="发送消息"'));
  assert.doesNotMatch(chatInputMarkup, /aria-label="语音输入"/);
  assert.doesNotMatch(chatInputMarkup, /aria-label="停止语音输入"/);
  assert.match(chatInputMarkup, /disabled=""/);
  assert.match(chatInputMarkup, /bg-slate-200/);
  assert.doesNotMatch(chatInputMarkup, /麦克风权限未开启/);
  assert.doesNotMatch(chatInputMarkup, /aria-label="打开相机"/);
  assert.doesNotMatch(chatInputMarkup, /aria-label="关闭上传菜单"/);
  assert.match(chatInputMarkup, /<textarea[^>]*class="[^"]*\bmin-w-0\b/);
  const chatInputComponentSource = readFileSync("app/(user)/chat-ui/components/ChatInput.tsx", "utf8");

  assert.match(chatInputComponentSource, /onFileUpload=\{\(\) => fileInputRef\.current\?\.click\(\)\}/);
  assert.match(chatInputComponentSource, /onCameraOpen=\{\(\) => cameraInputRef\.current\?\.click\(\)\}/);
  assert.match(chatInputComponentSource, /attachmentMenuRootRef/);
  assert.match(chatInputComponentSource, /ref=\{attachmentMenuRootRef\}/);
  assert.match(
    chatInputComponentSource,
    /!menuRoot\.contains\(target\)\) \{\s*setAttachmentMenuOpen\(false\)/
  );
  assert.match(chatInputComponentSource, /document\.addEventListener\("pointerdown", handleOutsidePointerDown\)/);
  assert.match(chatInputComponentSource, /document\.removeEventListener\("pointerdown", handleOutsidePointerDown\)/);
  assert.match(
    chatInputComponentSource,
    /paddingBottom:\s*"max\(1\.25rem, env\(safe-area-inset-bottom, 0px\), var\(--safe-area-inset-bottom, 0px\)\)"/
  );
  assert.doesNotMatch(chatInputComponentSource, /aria-label="关闭上传菜单"/);
  assert.doesNotMatch(chatInputComponentSource, /setTimeout\([^)]*fileInputRef/);
  assert.doesNotMatch(chatInputComponentSource, /onClick=\{\(\) => cameraInputRef\.current\?\.click\(\)\}/);

  const attachmentFile = new File(["合同内容"], "contract.pdf", {
    type: "application/pdf"
  });
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const revokedUrls: string[] = [];

  URL.createObjectURL = (() => "blob:chat-image-preview") as typeof URL.createObjectURL;
  URL.revokeObjectURL = ((url: string) => {
    revokedUrls.push(url);
  }) as typeof URL.revokeObjectURL;

  const attachment = createChatAttachmentFromFile(attachmentFile, "file");
  const imageAttachment = createChatAttachmentFromFile(new File(["image"], "photo.jpg", {
    type: "image/jpeg"
  }), "gallery");
  assert.equal(getCachedChatAttachmentPreviewUrl({
    type: "image",
    name: "photo.jpg",
    metadata: {
      local_id: imageAttachment.id
    }
  }), "blob:chat-image-preview");
  const selectedAttachmentMarkup = renderToStaticMarkup(
    <SelectedAttachmentList
      attachments={[imageAttachment, attachment]}
      onRemove={() => undefined}
    />
  );

  assert.match(selectedAttachmentMarkup, /<img/);
  assert.match(selectedAttachmentMarkup, /h-14 w-14/);
  assert.doesNotMatch(selectedAttachmentMarkup, /photo\.jpg/);
  assert.doesNotMatch(selectedAttachmentMarkup, /contract\.pdf/);
  assert.doesNotMatch(selectedAttachmentMarkup, /1KB/);
  assert.match(selectedAttachmentMarkup, /删除附件 2/);
  assert.equal(validateChatAttachmentFile({
    size: 99 * 1024 * 1024
  } as File), null);
  assert.equal(validateChatAttachmentFile({
    size: 101 * 1024 * 1024
  } as File), "单个附件不能超过 100MB。");
  assert.equal(removeChatAttachment([attachment], attachment.id ?? "").length, 0);
  assert.equal(removeChatAttachment([imageAttachment], imageAttachment.id ?? "").length, 0);
  assert.deepEqual(revokedUrls, ["blob:chat-image-preview"]);
  assert.equal(createAskRequestPayload({
    text: "删除附件后发送",
    attachments: removeChatAttachment([attachment], attachment.id ?? ""),
    conversation_id: null,
    mode: "fast",
    enable_deep_thinking: false,
    enable_web_search: false
  }).attachments.length, 0);
  assert.equal(createAskAttachmentPayload(attachment).metadata.source, "file");
  const chatInputSource = readFileSync("app/(user)/chat-ui/components/ChatInput.tsx", "utf8");

  assert.doesNotMatch(chatInputSource, /<Mic className=/);
  assert.doesNotMatch(chatInputSource, /SPEECH_/);
  assert.doesNotMatch(chatInputSource, /SpeechRecognition/);
  assert.doesNotMatch(chatInputSource, /aria-label=\{listening \? "停止语音输入" : "语音输入"\}/);
  assert.doesNotMatch(chatInputSource, /navigator\.mediaDevices\?\.getUserMedia/);
  assert.doesNotMatch(chatInputSource, /麦克风已开启，正在启动语音识别/);
  assert.doesNotMatch(chatInputSource, /onStatusMessage\?\.\("正在听\.\.\."\)/);
  assert.match(chatInputSource, /const hasText = value\.trim\(\)\.length > 0/);
  assert.match(chatInputSource, /const hasImageAttachment = attachments\.some\(isImageAttachmentDraft\)/);
  assert.match(chatInputSource, /const canSend = \(hasText \|\| hasImageAttachment\) && !loading/);
  assert.match(chatInputSource, /textareaRef = React\.useRef<HTMLTextAreaElement/);
  assert.match(chatInputSource, /const resizeTextarea = React\.useCallback/);
  assert.match(chatInputSource, /wrap="soft"/);
  assert.match(chatInputSource, /\[overflow-wrap:anywhere\]/);
  assert.match(chatInputSource, /rounded-\[28px\]/);
  assert.match(chatInputSource, /onSubmit=\{handleSubmit\}/);
  assert.match(chatInputSource, /disabled=\{!loading && !canSend\}/);
  assert.match(chatInputSource, /enabled:bg-blue-600/);
  assert.match(chatInputSource, /disabled:cursor-not-allowed/);
  assert.match(chatInputSource, /<SendHorizontal className="h-4 w-4"/);
  assert.match(chatInputSource, /<Plus className="h-6 w-6" strokeWidth=\{2\.2\}/);
  assert.match(chatInputSource, /const submittedAttachments = attachmentsRef\.current/);
  assert.match(chatInputSource, /shouldClearOptimistically/);
  assert.match(chatInputSource, /setAttachments\(\(current\) => \(current\.length === 0 \? submittedAttachments : current\)\)/);
  assert.doesNotMatch(chatInputSource, /border-2 border-slate-950/);

  const chatInputReadyMarkup = renderToStaticMarkup(
    <ChatInput
      value="可以发送"
      loading={false}
      onValueChange={() => undefined}
      onSubmit={() => undefined}
      onStatusMessage={() => undefined}
    />
  );

  assert.doesNotMatch(chatInputReadyMarkup, /disabled=""/);
  assert.match(chatInputReadyMarkup, /enabled:bg-blue-600/);

  const validAvatarFile = new File(["avatar"], "avatar.png", {
    type: "image/png"
  });
  const invalidAvatarFile = new File(["text"], "avatar.txt", {
    type: "text/plain"
  });
  const oversizedAvatarFile = new File([new Uint8Array(AVATAR_MAX_SIZE_BYTES + 1)], "avatar.png", {
    type: "image/png"
  });

  assert.equal(validateAvatarFile(validAvatarFile), null);
  assert.match(validateAvatarFile(invalidAvatarFile) ?? "", /仅支持/);
  assert.match(validateAvatarFile(oversizedAvatarFile) ?? "", /2MB/);
  const chatShellText = readFileSync("app/(user)/chat-ui/components/ChatShell.tsx", "utf8");
  const avatarDialogSource = readFileSync("app/(user)/chat-ui/components/AvatarSettingsDialog.tsx", "utf8");

  assert.match(chatShellText, /setCurrentUser/);
  assert.match(chatShellText, /function normalizeAvatarUrl/);
  assert.match(chatShellText, /const nextAvatarUrl = storedAvatarUrl \|\| remoteAvatarUrl/);
  assert.match(chatShellText, /setCurrentAvatarUrl\(storedAvatarUrl \|\| remoteAvatarUrl\)/);
  assert.match(chatShellText, /const immediateAvatarUrl = normalizeAvatarUrl\(nextAvatarUrl\)/);
  assert.match(chatShellText, /writeStoredAvatarUrl\(currentUser, immediateAvatarUrl\)/);
  assert.match(chatShellText, /mergeCurrentUserAvatar\(user, immediateAvatarUrl\)/);
  assert.match(chatShellText, /stableAvatarUrl = immediateAvatarUrl === null \? null : immediateAvatarUrl \|\| readStoredAvatarUrl\(user\) \|\| refreshedAvatarUrl/);
  assert.match(chatShellText, /mergeCurrentUserAvatar\(\{[\s\S]*stableAvatarUrl\)/);
  assert.match(avatarDialogSource, /rawValue && !\/\^\(\?:https\?:\|data:\|blob:\|\\\/\)\/i\.test\(rawValue\)/);
  assert.match(chatShellText, /pendingScrollToUserMessageIdRef\.current = optimisticUserMessage\.id/);
  assert.match(chatShellText, /setScrollFocusMessageId\(optimisticUserMessage\.id\)/);
  const chatTransportApiSource = readFileSync("app/(user)/chat-ui/api.ts", "utf8");
  const chatSseStreamingSource = readFileSync("lib/ai-chat/streaming.ts", "utf8");

  assert.match(chatTransportApiSource, /ASK_CHAT_TOTAL_TIMEOUT_MS = 90_000/);
  assert.match(chatTransportApiSource, /function isCareerMentorAskRequest\(input: AskChatRequest\)/);
  assert.match(chatTransportApiSource, /CAREER_MENTOR_AGENT_IDS\.has\(agentId\)[\s\S]{0,100}CAREER_MENTOR_KNOWLEDGE_BASE_IDS\.has\(knowledgeBaseId\)/);
  assert.match(chatTransportApiSource, /const timeout = isCareerMentorAskRequest\(input\)[\s\S]{0,40}\? null/);
  assert.match(chatTransportApiSource, /回答连接已中断，请检查网络后重新发送/);
  assert.match(chatTransportApiSource, /回答时间较长，连接已自动结束/);
  assert.match(chatSseStreamingSource, /SSE_HEARTBEAT_INTERVAL_MS = 12_000/);
  assert.match(chatSseStreamingSource, /CAREER_MENTOR_STREAM_CHUNK_SIZE = 24/);
  assert.match(chatSseStreamingSource, /streamTextTokens\(finalResult\.answer \?\? "", emit, signal, streamChunkSize\)/);
  assert.match(chatSseStreamingSource, /writer\.enqueue\(`: heartbeat/);
  assert.doesNotMatch(chatSseStreamingSource, /type: "token"[\s\S]{0,120}heartbeat/);
  assert.match(chatShellText, /scrollChatMessageToTop\(targetMessageId, "auto"\)/);
  assert.match(chatShellText, /PROMPT_HISTORY_RAIL_MARK_COUNT/);
  assert.match(chatShellText, /type PromptHistoryItem =/);
  assert.match(chatShellText, /function buildPromptHistoryItems\(messages: ChatMessageView\[\]\): PromptHistoryItem\[\]/);
  assert.match(chatShellText, /const promptHistory = React\.useMemo\(\(\) => buildPromptHistoryItems\(visibleMessages\), \[visibleMessages\]\)/);
  assert.match(chatShellText, /if \(prompts\.length === 0\) \{\s*return null;/);
  assert.match(chatShellText, /<PromptHistoryRail prompts=\{promptHistory\}/);
  assert.match(chatShellText, /aria-label="提示词记录条"/);
  assert.match(chatShellText, /onSelect: \(item: PromptHistoryItem\) => void/);
  assert.match(chatShellText, /onSelect\(item\)/);
  assert.match(chatShellText, /scrollChatMessageToTop\(item\.messageId, "smooth"\)/);
  assert.match(chatShellText, /已定位到对应提示词/);
  assert.match(chatShellText, /setPromptHistoryPanelOpen\(true\)/);
  assert.match(chatShellText, /setPromptHistoryPanelOpen\(false\)/);
  assert.match(chatShellText, /promptHistoryPanelOpen \? "block" : "hidden"/);
  assert.match(chatShellText, /right-10 top-1\/2/);
  assert.doesNotMatch(chatShellText, /setInput\(prompt\)/);
  assert.doesNotMatch(chatShellText, /PROMPT_HISTORY_STORAGE_KEY_PREFIX|readPromptHistory|writePromptHistory/);
  assert.doesNotMatch(chatShellText, /right-3 top-24 z-20 hidden lg:flex/);
  assert.match(chatShellText, /aria-label="滚动到底部"/);
  assert.match(chatShellText, /<ArrowDown className="h-5 w-5"/);
  assert.equal(getCurrentChatUserDisplayName({
    id: "user_1",
    nickname: "蔡姑",
    phone: "+8613360587600",
    licenseActivated: true
  }), "蔡姑");
  assert.equal(getCurrentChatUserAccount({
    id: "user_1",
    phone: "+8613360587600",
    licenseActivated: true
  }), "+8613360587600");

  const quickActionsPageText = readFileSync("app/(workspace)/quick-actions/page.tsx", "utf8");

  assert.match(quickActionsPageText, /快捷分类管理/);
  assert.match(quickActionsPageText, /分类名称/);
  assert.match(quickActionsPageText, /点击动作/);
  assert.match(quickActionsPageText, /快捷提示词/);

  for (const routeFile of [
    "app/api/ai/chat/ask/route.ts",
    "app/api/ai/chat/attachments/route.ts",
    "app/api/ai/chat/conversations/route.ts",
    "app/api/ai/chat/history/route.ts"
  ]) {
    assert.match(readFileSync(routeFile, "utf8"), /requireAiChatAccess/);
  }

  const chatApiSource = readFileSync("app/(user)/chat-ui/api.ts", "utf8");

  assert.match(chatApiSource, /fetch\("\/api\/ai\/chat\/conversations", \{\s*method: "GET",\s*credentials: "include"/);
  assert.match(chatApiSource, /fetch\(`\/api\/ai\/chat\/history\?\$\{params\.toString\(\)\}`, \{\s*method: "GET",\s*credentials: "include"/);

  const schemaText = readFileSync("prisma/schema.prisma", "utf8");
  const migrationText = readFileSync("prisma/migrations/20260607140000_add_quick_action_categories/migration.sql", "utf8");
  const adminQuickActionsRoute = readFileSync("app/api/admin/quick-actions/route.ts", "utf8");
  const userQuickActionsRoute = readFileSync("app/api/user/quick-actions/route.ts", "utf8");

  assert.match(schemaText, /model QuickActionCategory/);
  assert.match(migrationText, /CREATE TABLE "quick_action_categories"/);
  assert.match(migrationText, /quick_default_creative/);
  assert.match(adminQuickActionsRoute, /requireKbAdmin/);
  assert.match(adminQuickActionsRoute, /export async function GET/);
  assert.match(adminQuickActionsRoute, /export async function POST/);
  assert.match(adminQuickActionsRoute, /export async function PATCH/);
  assert.match(adminQuickActionsRoute, /export async function DELETE/);
  assert.match(userQuickActionsRoute, /requireLicensedUser/);
  assert.match(userQuickActionsRoute, /WHERE enabled = true/);
  assert.match(userQuickActionsRoute, /export async function GET/);
  assert.doesNotMatch(userQuickActionsRoute, /export async function (POST|PATCH|DELETE)/);

  assert.match(readFileSync("components/app-shell.tsx", "utf8"), /快捷分类/);

  const modeMarkup = renderToStaticMarkup(
    <ModeToggle mode="fast" onChange={() => undefined} />
  );

  assert.match(modeMarkup, /业务处理/);
  assert.match(modeMarkup, /专家研判/);
  assert.equal(normalizeChatMode("expert"), "expert");
  assert.equal(normalizeChatMode("unknown"), "fast");

  const payload = createAskRequestPayload({
    text: "  退款流程怎么处理？ ",
    attachments: [attachment],
    conversation_id: "conv_1",
    mode: "expert",
    enable_deep_thinking: true,
    enable_web_search: true
  });

  assert.equal(payload.question, "退款流程怎么处理？");
  assert.equal(payload.mode, "expert");
  assert.equal(payload.enable_deep_thinking, true);
  assert.equal(payload.enable_web_search, true);
  assert.equal(payload.attachments[0].name, "contract.pdf");
  assert.equal(payload.attachments[0].metadata.source, "file");
  assert.equal(Object.prototype.hasOwnProperty.call(payload.attachments[0], "previewUrl"), false);
  const imagePayload = createAskRequestPayload({
    text: "  图片历史测试 ",
    attachments: [imageAttachment],
    conversation_id: "conv_1",
    mode: "fast",
    enable_deep_thinking: false,
    enable_web_search: false
  });

  assert.equal(imagePayload.attachments[0].metadata.previewUrl, undefined);
  assert.equal(imagePayload.attachments[0].metadata.url, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(imagePayload.attachments[0], "previewUrl"), false);
  assert.doesNotMatch(JSON.stringify(imagePayload.attachments[0]), /blob:chat-image-preview/);
  const uploadedImagePayload = createAskRequestPayload({
    text: "  图片历史测试 ",
    attachments: [{
      ...imageAttachment,
      filename: "photo.jpg",
      url: "/uploads/chat-attachments/photo.jpg",
      publicUrl: "/uploads/chat-attachments/photo.jpg",
      fileUrl: "/uploads/chat-attachments/photo.jpg",
      downloadUrl: "/api/ai/chat/attachments/download?key=user_1/2026/06/photo.jpg",
      storage: "netlify-blobs",
      blobKey: "user_1/2026/06/photo.jpg"
    }],
    conversation_id: "conv_1",
    mode: "fast",
    enable_deep_thinking: false,
    enable_web_search: false
  });

  assert.equal(uploadedImagePayload.attachments[0].url, "/uploads/chat-attachments/photo.jpg");
  assert.equal(uploadedImagePayload.attachments[0].publicUrl, "/uploads/chat-attachments/photo.jpg");
  assert.equal(uploadedImagePayload.attachments[0].fileUrl, "/uploads/chat-attachments/photo.jpg");
  assert.equal(uploadedImagePayload.attachments[0].downloadUrl, "/api/ai/chat/attachments/download?key=user_1/2026/06/photo.jpg");
  assert.equal(uploadedImagePayload.attachments[0].storage, "netlify-blobs");
  assert.equal(uploadedImagePayload.attachments[0].blobKey, "user_1/2026/06/photo.jpg");
  assert.equal(uploadedImagePayload.attachments[0].metadata.url, "/uploads/chat-attachments/photo.jpg");
  assert.equal(uploadedImagePayload.attachments[0].metadata.publicUrl, "/uploads/chat-attachments/photo.jpg");
  assert.equal(uploadedImagePayload.attachments[0].metadata.fileUrl, "/uploads/chat-attachments/photo.jpg");

  const localUserMessage = createUserMessage("退款流程怎么处理？", [imageAttachment, attachment]);
  const messages = appendAskResult([localUserMessage], localUserMessage.id, {
    answer: "退款需要先核对订单号。",
    customer_answer: "您好，关于退款流程，可以这样理解：\n\n1. 需要先核对订单号、付款时间和售后原因。\n2. 如果信息不完整，建议先补充订单截图或联系方式。\n3. 退款范围需要由负责人确认后再回复客户。",
    conversation_id: "conv_1",
    message_id: "msg_ai_1",
    mode: "fast",
    sources: [
      {
        chunk_id: "chunk_1",
        file_id: "file_1",
        title: "退款处理流程",
        score: 0.82
      }
    ],
    confidence: "high"
  });

  assert.equal(messages.length, 2);
  assert.equal(messages[0].pending, false);
  assert.equal(messages[0].attachments?.[0]?.name, "photo.jpg");
  assert.equal(messages[0].attachments?.[1]?.name, "contract.pdf");
  assert.equal(messages[1].content, "退款需要先核对订单号。");
  assert.match(messages[1].customer_answer ?? "", /可?以这样理解|需要先核对订单号/);
  assert.equal(messages[1].sources?.[0]?.chunk_id, "chunk_1");

  const chatMessagesMarkup = renderToStaticMarkup(
    <ChatMessages
      messages={messages}
      loading={false}
      mode="fast"
      onModeChange={() => undefined}
    />
  );

  assert.match(chatMessagesMarkup, /退款需要先核对订单号/);
  assert.match(chatMessagesMarkup, /打开图片预览 1/);
  assert.match(chatMessagesMarkup, /data-chat-user-message-bubble="attachments"/);
  assert.match(chatMessagesMarkup, /<img/);
  assert.match(chatMessagesMarkup, /blob:chat-image-preview/);
  assert.doesNotMatch(chatMessagesMarkup, /photo\.jpg/);
  assert.match(chatMessagesMarkup, /contract\.pdf/);
  assert.match(chatMessagesMarkup, /aria-label="复制用户消息"/);
  assert.match(chatMessagesMarkup, /aria-label="编辑用户消息"/);
  assert.ok(
    chatMessagesMarkup.indexOf('data-chat-user-message-bubble="attachments"') < chatMessagesMarkup.indexOf('data-chat-image-thumbnail="true"')
  );
  assert.ok(
    chatMessagesMarkup.indexOf('data-chat-image-thumbnail="true"') < chatMessagesMarkup.indexOf("退款流程怎么处理？")
  );
  assert.ok(
    chatMessagesMarkup.indexOf("退款流程怎么处理？") < chatMessagesMarkup.indexOf("aria-label=\"复制用户消息\"")
  );
  assert.ok(
    chatMessagesMarkup.indexOf("bg-blue-600") < chatMessagesMarkup.indexOf("aria-label=\"编辑用户消息\"")
  );
  const avatarUser = {
    id: "user_1",
    name: "蔡姑",
    phone: "+8613360587600",
    avatar_url: "/uploads/avatars/user_1.png",
    licenseActivated: true
  };
  const chatAvatarMarkup = renderToStaticMarkup(
    <ChatMessages
      messages={messages}
      loading={false}
      mode="fast"
      onModeChange={() => undefined}
      currentUser={avatarUser}
      userAvatarUrl="/uploads/avatars/user_1.png"
    />
  );

  assert.equal(getCurrentChatUserAvatarUrl(avatarUser), "/uploads/avatars/user_1.png");
  assert.match(chatAvatarMarkup, /alt="当前用户头像"/);
  assert.match(chatAvatarMarkup, /src="\/uploads\/avatars\/user_1\.png"/);
  assert.doesNotMatch(chatAvatarMarkup, /lucide-bot/);
  assert.equal(drawerWithAvatarMarkup.includes('src="/uploads/avatars/user_1.png"'), true);
  assert.equal(chatAvatarMarkup.includes('src="/uploads/avatars/user_1.png"'), true);
  assert.equal(
    normalizeCurrentChatUserAvatarUrl("http://127.0.0.1:3021/api/auth/avatar/user_1.png?v=123"),
    "/api/auth/avatar/user_1.png?v=123"
  );
  assert.equal(
    getCurrentChatUserAvatarUrl({
      id: "user_loopback",
      name: "内网头像",
      avatar_url: "http://127.0.0.1:3021/api/auth/avatar/user_loopback.png?v=456",
      licenseActivated: true
    }),
    "/api/auth/avatar/user_loopback.png?v=456"
  );

  const chatCamelAvatarMarkup = renderToStaticMarkup(
    <ChatMessages
      messages={messages}
      loading={false}
      mode="fast"
      onModeChange={() => undefined}
      currentUser={{
        id: "user_camel",
        name: "驼峰头像",
        avatarUrl: "/uploads/avatars/camel-avatar.webp",
        licenseActivated: true
      }}
    />
  );

  assert.equal(getCurrentChatUserAvatarUrl({
    id: "user_camel",
    avatarUrl: "/uploads/avatars/camel-avatar.webp",
    licenseActivated: true
  }), "/uploads/avatars/camel-avatar.webp");
  assert.match(chatCamelAvatarMarkup, /src="\/uploads\/avatars\/camel-avatar\.webp"/);

  const cachedAvatarUrl = "/uploads/avatars/cached-user.png";
  const chatCachedAvatarMarkup = renderToStaticMarkup(
    <ChatMessages
      messages={messages}
      loading={false}
      mode="fast"
      onModeChange={() => undefined}
      currentUser={{
        id: "user_cached",
        name: "缓存头像",
        licenseActivated: true
      }}
      userAvatarUrl={cachedAvatarUrl}
    />
  );

  assert.match(chatCachedAvatarMarkup, /src="\/uploads\/avatars\/cached-user\.png"/);
  assert.notEqual(
    getChatUserAvatarStorageKey({
      id: "user_cached",
      licenseActivated: true
    }),
    getChatUserAvatarStorageKey({
      id: "user_other",
      licenseActivated: true
    })
  );

  const noAvatarMarkup = renderToStaticMarkup(
    <ChatMessages
      messages={messages}
      loading={false}
      mode="fast"
      onModeChange={() => undefined}
      currentUser={{
        id: "user_no_avatar",
        name: "蔡姑",
        licenseActivated: true
      }}
    />
  );

  assert.match(noAvatarMarkup, /当前用户默认头像/);
  assert.match(noAvatarMarkup, />蔡<\/div>/);
  assert.doesNotMatch(noAvatarMarkup, /cached-user\.png/);
  assert.equal(getUserMessageCopyText(messages[0]), "退款流程怎么处理？");
  assert.equal(getUserMessageCopyText({
    content: "",
    attachments: [imageAttachment]
  }), "暂无文字可复制");
  let copiedUserText = "";

  await copyUserMessageToClipboard(getUserMessageCopyText(messages[0]), {
    writeText: async (value) => {
      copiedUserText = value;
    }
  });

  assert.equal(copiedUserText, "退款流程怎么处理？");
  const chatMessagesSource = readFileSync("app/(user)/chat-ui/components/ChatMessages.tsx", "utf8");

  assert.doesNotMatch(chatMessagesSource, /import \{ Bot/);
  assert.doesNotMatch(chatMessagesSource, /<Bot className=/);
  assert.match(chatMessagesSource, /text-\[11px\] leading-none text-slate-400/);
  assert.doesNotMatch(chatMessagesSource, /bg-blue-600[\s\S]{0,220}formatMessageTime\(message\.created_at\)/);
  assert.match(chatMessagesSource, /图片预览不可用/);
  assert.match(chatMessagesSource, /文件暂不可预览/);
  assert.match(chatMessagesSource, /打开文件 \$\{name\}/);
  assert.match(chatMessagesSource, /function formatAttachmentSize/);
  assert.match(chatMessagesSource, /function UserMessageBlock/);
  assert.match(chatMessagesSource, /function UserMessageAvatar/);
  assert.match(chatMessagesSource, /function UserMessageActions/);
  assert.match(chatMessagesSource, /safeCopyTextDetailed\(copyText, \{ selectTarget: selectionRef\.current \}\)/);
  assert.match(chatMessagesSource, /copyState === "manual"/);
  assert.doesNotMatch(chatMessagesSource, /if \(!navigator\.clipboard\)\s*\{\s*return;/);
  assert.match(chatMessagesSource, /data-chat-message-id=\{message\.id\}/);
  assert.match(chatMessagesSource, /data-chat-focus-spacer=\{focusMessageId\}/);
  assert.match(chatMessagesSource, /getCurrentChatUserAvatarUrl\(currentUser\)/);
  assert.match(chatMessagesSource, /getCurrentChatUserInitial\(currentUser\)/);
  assert.match(chatMessagesSource, /alt="当前用户头像"/);
  assert.match(chatMessagesSource, /onEditUserMessage\?\.\(message\.content\)/);
  assert.match(chatMessagesSource, /data-chat-user-message-bubble="attachments"/);
  assert.match(chatMessagesSource, /data-chat-image-thumbnail="true"/);
  assert.match(chatMessagesSource, /max-w-\[min\(220px,62vw\)\]/);
  assert.match(chatMessagesSource, /max-h-\[260px\]/);
  assert.match(chatMessagesSource, /getAttachmentPreviewUrls/);
  assert.match(chatMessagesSource, /data-fallback-count=\{previewUrls\.length\}/);
  assert.match(chatMessagesSource, /onError=\{handleImageError\}/);
  assert.match(chatMessagesSource, /activeIndex \+ 1 < previewUrls\.length/);
  assert.match(chatMessagesSource, /关闭图片预览/);
  assert.match(chatMessagesSource, /attachment\.src/);
  assert.match(chatMessagesSource, /attachment\.dataUrl/);
  assert.match(chatMessagesSource, /attachment\.fileUrl/);
  assert.match(chatMessagesSource, /attachment\.publicUrl/);
  assert.match(chatMessagesSource, /attachment\.downloadUrl/);
  assert.match(chatMessagesSource, /attachment\.path/);
  assert.match(chatMessagesSource, /attachment\.storagePath/);
  const userTimestampMarkup = renderToStaticMarkup(
    <ChatMessages
      messages={[
        {
          id: "user-time-placement",
          role: "user",
          content: "用户消息时间在气泡外",
          created_at: "2026-06-01T10:00:00.000Z",
          attachments: []
        }
      ]}
      loading={false}
      mode="fast"
      onModeChange={() => undefined}
      currentUser={{
        id: "user_time",
        name: "时间用户",
        licenseActivated: true
      }}
    />
  );

  assert.match(userTimestampMarkup, /text-right text-\[11px\]/);
  assert.ok(userTimestampMarkup.indexOf("text-right text-[11px]") < userTimestampMarkup.indexOf("bg-blue-600"));
  assert.ok(userTimestampMarkup.indexOf("bg-blue-600") < userTimestampMarkup.indexOf("用户消息时间在气泡外"));
  assert.match(userTimestampMarkup, /当前用户默认头像/);
  const chatShellSourceForEdit = readFileSync("app/(user)/chat-ui/components/ChatShell.tsx", "utf8");

  assert.match(chatShellSourceForEdit, /function handleEditUserMessage/);
  assert.match(chatShellSourceForEdit, /setInput\(content\)/);
  assert.match(chatShellSourceForEdit, /onEditUserMessage=\{handleEditUserMessage\}/);
  assert.match(chatShellSourceForEdit, /userAvatarUrl=\{currentAvatarUrl\}/);
  assert.match(chatShellSourceForEdit, /currentUser=\{currentUser\}/);
  assert.match(chatShellSourceForEdit, /mergeCurrentUserAvatar\(user, immediateAvatarUrl\)/);
  const historyImageMarkup = renderToStaticMarkup(
    <ChatMessages
      messages={[
        {
          id: "history-user-image",
          role: "user",
          content: "历史图片",
          created_at: "2026-06-01T10:00:00.000Z",
          attachments: [
            {
              type: "file",
              name: "history-photo.png",
              src: "https://example.com/history-photo.png"
            },
            {
              type: "image",
              name: "preview-photo.jpg",
              previewUrl: "blob:history-preview-url"
            },
            {
              type: "image",
              name: "url-photo.jpg",
              url: "/uploads/url-photo.jpg"
            },
            {
              type: "image",
              name: "metadata-photo.webp",
              metadata: {
                dataUrl: "data:image/webp;base64,AAAA"
              }
            },
            {
              type: "image",
              name: "metadata-url-photo.jpg",
              metadata: {
                url: "/uploads/metadata-url-photo.jpg"
              }
            },
            {
              type: "image",
              name: "file-url-photo.jpg",
              fileUrl: "/uploads/file-url-photo.jpg"
            },
            {
              type: "image",
              name: "public-url-photo.jpg",
              publicUrl: "https://example.com/public-url-photo.jpg"
            },
            {
              type: "image",
              name: "download-url-photo.jpg",
              downloadUrl: "/api/files/download-url-photo.jpg"
            },
            {
              type: "image",
              name: "path-photo.jpg",
              path: "/uploads/path-photo.jpg"
            },
            {
              type: "image",
              name: "storage-path-photo.jpg",
              storagePath: "/uploads/storage-path-photo.jpg"
            },
            {
              type: "image",
              name: "local-public-photo.jpg",
              url: "/uploads/chat-attachments/user_1-1719800000000-123e4567-e89b-12d3-a456-426614174000.jpg"
            },
            {
              type: "image",
              name: "local-reference-photo.jpg",
              storage: "local-public",
              reference_id: "user_1-1719800000001-123e4567-e89b-12d3-a456-426614174001.jpg"
            },
            {
              type: "image",
              name: "cached-photo.jpg",
              metadata: {
                local_id: imageAttachment.id
              }
            },
            {
              type: "image",
              filename: "filename-photo.png",
              metadata: {
                publicUrl: "/uploads/filename-photo.png"
              }
            },
            {
              type: "image",
              name: "priority-photo.jpg",
              src: "/uploads/wrong-src-photo.jpg",
              dataUrl: "data:image/jpeg;base64,WRONG",
              publicUrl: "/api/ai/chat/attachments/download?key=user_1/2026/06/priority.jpg"
            },
            {
              type: "image",
              name: "metadata-priority-photo.jpg",
              metadata: {
                src: "/uploads/wrong-metadata-src-photo.jpg",
                publicUrl: "/api/ai/chat/attachments/download?key=user_1/2026/06/metadata-priority.jpg"
              }
            },
            {
              type: "image",
              name: "lost-photo.jpg"
            },
            {
              type: "file",
              name: "history-contract.pdf",
              size: 2048,
              url: "/uploads/chat-attachments/history-contract.pdf"
            },
            attachment
          ]
        }
      ]}
      loading={false}
      mode="fast"
      onModeChange={() => undefined}
    />
  );

  assert.match(historyImageMarkup, /打开图片预览 1/);
  assert.doesNotMatch(historyImageMarkup, /打开图片预览 preview-photo\.jpg/);
  assert.match(historyImageMarkup, /data-fallback-count/);
  assert.match(historyImageMarkup, /blob:history-preview-url/);
  assert.match(historyImageMarkup, /\/uploads\/url-photo\.jpg/);
  assert.match(historyImageMarkup, /https:\/\/example\.com\/history-photo\.png/);
  assert.match(historyImageMarkup, /data:image\/webp;base64,AAAA/);
  assert.match(historyImageMarkup, /\/uploads\/metadata-url-photo\.jpg/);
  assert.match(historyImageMarkup, /\/uploads\/file-url-photo\.jpg/);
  assert.match(historyImageMarkup, /https:\/\/example\.com\/public-url-photo\.jpg/);
  assert.match(historyImageMarkup, /\/api\/files\/download-url-photo\.jpg/);
  assert.match(historyImageMarkup, /\/uploads\/path-photo\.jpg/);
  assert.match(historyImageMarkup, /\/uploads\/storage-path-photo\.jpg/);
  assert.match(historyImageMarkup, /\/uploads\/chat-attachments\/user_1-1719800000000-123e4567-e89b-12d3-a456-426614174000\.jpg/);
  assert.match(historyImageMarkup, /blob:chat-image-preview/);
  assert.match(historyImageMarkup, /\/uploads\/filename-photo\.png/);
  assert.match(historyImageMarkup, /\/api\/ai\/chat\/attachments\/download\?key=user_1\/2026\/06\/priority\.jpg/);
  assert.doesNotMatch(historyImageMarkup, /wrong-src-photo|WRONG/);
  assert.match(historyImageMarkup, /\/api\/ai\/chat\/attachments\/download\?key=user_1\/2026\/06\/metadata-priority\.jpg/);
  assert.doesNotMatch(historyImageMarkup, /wrong-metadata-src-photo/);
  assert.doesNotMatch(historyImageMarkup, /lost-photo\.jpg/);
  assert.match(historyImageMarkup, /图片预览不可用/);
  assert.match(historyImageMarkup, /打开文件 history-contract\.pdf/);
  assert.match(historyImageMarkup, /\/uploads\/chat-attachments\/history-contract\.pdf/);
  assert.match(historyImageMarkup, /2KB/);
  assert.match(historyImageMarkup, /contract\.pdf/);
  assert.match(historyImageMarkup, /文件暂不可预览/);

  const localPublicUrls = getAttachmentPreviewUrls({
    type: "image",
    name: "local-public-photo.jpg",
    url: "/uploads/chat-attachments/user_1-1719800000000-123e4567-e89b-12d3-a456-426614174000.jpg"
  } as Parameters<typeof getAttachmentPreviewUrls>[0]);

  assert.ok(localPublicUrls.includes("/uploads/chat-attachments/user_1-1719800000000-123e4567-e89b-12d3-a456-426614174000.jpg"));
  assert.ok(
    localPublicUrls.includes("/api/ai/chat/attachments/download?key=user_1-1719800000000-123e4567-e89b-12d3-a456-426614174000.jpg")
  );

  const localReferenceUrls = getAttachmentPreviewUrls({
    type: "image",
    name: "local-reference-photo.jpg",
    reference_id: "user_1-1719800000001-123e4567-e89b-12d3-a456-426614174001.jpg"
  } as Parameters<typeof getAttachmentPreviewUrls>[0]);

  assert.deepEqual(localReferenceUrls, [
    "/api/ai/chat/attachments/download?key=user_1-1719800000001-123e4567-e89b-12d3-a456-426614174001.jpg"
  ]);

  const fallbackUrls = getAttachmentPreviewUrls({
    id: "fallback-attachment",
    type: "image",
    name: "fallback.png",
    previewUrl: "blob:expired-preview",
    publicUrl: "https://cdn.example.com/fallback.png",
    storagePath: "user_1/2026/07/fallback.png",
    reference_id: "user_1-1719800000002-123e4567-e89b-12d3-a456-426614174002.png",
    metadata: {
      storagePath: "user_1/2026/07/fallback-metadata.png"
    }
  } as Parameters<typeof getAttachmentPreviewUrls>[0]);

  assert.equal(fallbackUrls[0], "blob:expired-preview");
  assert.ok(fallbackUrls.includes("https://cdn.example.com/fallback.png"));
  assert.ok(fallbackUrls.includes("/uploads/fallback.png"));
  assert.ok(fallbackUrls.includes("/api/ai/chat/attachments/download?key=user_1%2F2026%2F07%2Ffallback.png"));
  assert.ok(fallbackUrls.includes("/uploads/fallback-metadata.png"));
  assert.ok(
    fallbackUrls.includes("/api/ai/chat/attachments/download?key=user_1%2F2026%2F07%2Ffallback-metadata.png")
  );
  assert.ok(
    fallbackUrls.includes("/api/ai/chat/attachments/download?key=user_1-1719800000002-123e4567-e89b-12d3-a456-426614174002.png")
  );

  const stringAttachmentsMarkup = renderToStaticMarkup(
    <ChatMessages
      messages={[
        {
          id: "history-string-attachments",
          role: "user",
          content: "字符串附件",
          created_at: "2026-06-01T10:02:00.000Z",
          attachments: JSON.stringify([
            {
              type: "image",
              name: "json-string-photo.jpg",
              metadata: {
                url: "/uploads/json-string-photo.jpg"
              }
            }
          ]) as unknown as []
        }
      ]}
      loading={false}
      mode="fast"
      onModeChange={() => undefined}
    />
  );

  assert.match(stringAttachmentsMarkup, /打开图片预览 1/);
  assert.doesNotMatch(stringAttachmentsMarkup, /打开图片预览 json-string-photo\.jpg/);
  assert.match(stringAttachmentsMarkup, /\/uploads\/json-string-photo\.jpg/);
  assert.match(chatMessagesMarkup, /小董AI/);
  assert.match(chatMessagesMarkup, /退款需要先核对订单号/);
  assert.doesNotMatch(chatMessagesMarkup, /引用来源/);
  assert.doesNotMatch(chatMessagesMarkup, /退款处理流程/);
  assert.match(chatMessagesMarkup, /复制答案/);
  assert.doesNotMatch(chatMessagesMarkup, /RAG confidence/);
  assert.doesNotMatch(chatMessagesMarkup, /chunk: chunk_1/);

  const richSections = buildRichAnswerSections({
    answer: messages[1].content,
    customerAnswer: messages[1].customer_answer,
    providerStatus: "provider_not_configured"
  });

  assert.ok(richSections.some((section) => section.title === "核心判断"));
  assert.ok(richSections.some((section) => section.title === "注意事项"));

  const customerParagraphs = splitCustomerAnswerParagraphs(messages[1].customer_answer ?? "");

  assert.ok(customerParagraphs.length >= 2);
  assert.equal(customerParagraphs.every((paragraph) => paragraph.length <= 100), true);

  const customerCardMarkup = renderToStaticMarkup(
    <CustomerAnswerCard content={messages[1].customer_answer} />
  );

  assert.match(customerCardMarkup, /可直接复制给客户/);
  assert.match(customerCardMarkup, /已整理为适合对外沟通的简洁答案/);
  assert.match(customerCardMarkup, /复制全部话术/);
  assert.match(customerCardMarkup, /复制本段/);
  assert.match(customerCardMarkup, /需要先核对订单号/);

  let copiedText = "";

  await copyCustomerAnswerToClipboard("客户答案", {
    writeText: async (value: string) => {
      copiedText = value;
    }
  });

  assert.equal(copiedText, "客户答案");

  await copyCustomerAnswerToClipboard(customerParagraphs[0], {
    writeText: async (value: string) => {
      copiedText = value;
    }
  });

  assert.equal(copiedText, customerParagraphs[0]);

  await copyAnswerSectionToClipboard("分析卡片内容", {
    writeText: async (value: string) => {
      copiedText = value;
    }
  });

  assert.equal(copiedText, "分析卡片内容");

  const resetState = createNewChatState();

  assert.equal(resetState.conversationId, null);
  assert.equal(resetState.messages.length, 0);
  assert.equal(resetState.input, "");

  const originalFetch = globalThis.fetch;
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });

    return new Response(JSON.stringify({
      ok: true,
      success: true,
      data: {
        conversation: {
          id: "conv_2",
          title: "第二条历史",
          mode: "expert",
          metadata: null,
          message_count: 1,
          created_at: "2026-06-01T09:00:00.000Z",
          updated_at: "2026-06-01T09:00:00.000Z"
        },
        messages: [
          {
            id: "msg_history_1",
            role: "user",
            content: "联创历史问题",
            created_at: "2026-06-01T09:01:00.000Z",
            attachments: []
          }
        ]
      }
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }) as typeof fetch;

  const historyController = new AbortController();
  const historyResult = await fetchConversationHistory("conv_2", {
    signal: historyController.signal
  });

  assert.equal(String(calls.at(-1)?.input), "/api/ai/chat/history?conversation_id=conv_2");
  assert.equal(calls.at(-1)?.init?.method, "GET");
  assert.equal(calls.at(-1)?.init?.credentials, "include");
  assert.equal(calls.at(-1)?.init?.cache, "no-store");
  assert.ok(calls.at(-1)?.init?.signal instanceof AbortSignal);
  assert.notEqual(calls.at(-1)?.init?.signal, historyController.signal);
  assert.equal(historyResult.conversation.id, "conv_2");
  assert.equal(historyResult.messages[0].content, "联创历史问题");

  calls.length = 0;
  let historyAttempt = 0;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    historyAttempt += 1;

    if (historyAttempt === 1) {
      return new Response(JSON.stringify({
        ok: false,
        success: false,
        error: {
          message: "历史服务暂时繁忙。"
        }
      }), {
        status: 503,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      success: true,
      data: historyResult
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }) as typeof fetch;

  const retriedHistoryResult = await fetchConversationHistory("conv_2", {
    timeoutMs: 1_000
  });

  assert.equal(historyAttempt, 2);
  assert.equal(calls.length, 2);
  assert.equal(retriedHistoryResult.messages[0].content, "联创历史问题");

  globalThis.fetch = originalFetch;
  calls.length = 0;

  const conversationListPayload = {
    ok: true,
    success: true,
    data: {
      conversations: [
        {
          id: "conv_retry_success",
          title: "重试后加载成功",
          mode: "fast",
          metadata: null,
          message_count: 1,
          created_at: "2026-07-14T11:00:00.000Z",
          updated_at: "2026-07-14T11:01:00.000Z"
        }
      ]
    }
  };

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });

    if (calls.length === 1) {
      return new Response(JSON.stringify({
        ok: false,
        error: { message: "服务繁忙" }
      }), {
        status: 503,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify(conversationListPayload), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;

  const retriedConversationList = await fetchConversations({ timeoutMs: 50 });

  assert.equal(calls.length, 2);
  assert.equal(retriedConversationList.conversations[0].id, "conv_retry_success");
  assert.equal(calls[0].init?.method, "GET");
  assert.equal(calls[0].init?.credentials, "include");
  assert.equal(calls[0].init?.cache, "no-store");
  assert.equal(calls[0].init?.signal instanceof AbortSignal, true);

  calls.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });

    return new Response(JSON.stringify({
      ok: false,
      error: { message: "请先登录" }
    }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;

  await assert.rejects(
    fetchConversations({ timeoutMs: 50 }),
    /请先登录后再继续使用小董AI助手/
  );
  assert.equal(calls.length, 1);

  calls.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });

    return new Response(JSON.stringify({
      ok: false,
      error: { message: "服务繁忙，请稍后重试" }
    }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": "60"
      }
    });
  }) as typeof fetch;

  await assert.rejects(
    fetchConversations({ timeoutMs: 50 }),
    /服务繁忙，请稍后重试/
  );
  assert.equal(calls.length, 1);

  calls.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });

    if (calls.length === 1) {
      throw new TypeError("network unavailable");
    }

    return new Response(JSON.stringify(conversationListPayload), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;

  const networkRetriedConversationList = await fetchConversations({ timeoutMs: 50 });

  assert.equal(calls.length, 2);
  assert.equal(networkRetriedConversationList.conversations.length, 1);

  calls.length = 0;
  const externalConversationAbortController = new AbortController();

  externalConversationAbortController.abort();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    throw new Error("aborted request must not reach fetch");
  }) as typeof fetch;

  await assert.rejects(
    fetchConversations({
      signal: externalConversationAbortController.signal,
      timeoutMs: 50
    }),
    (requestError: unknown) => requestError instanceof DOMException && requestError.name === "AbortError"
  );
  assert.equal(calls.length, 0);

  calls.length = 0;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });

    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;

      if (signal?.aborted) {
        reject(new DOMException("aborted", "AbortError"));
        return;
      }

      signal?.addEventListener("abort", () => {
        reject(new DOMException("aborted", "AbortError"));
      }, { once: true });
    });
  }) as typeof fetch;

  await assert.rejects(
    fetchConversations({ timeoutMs: 5 }),
    /历史会话加载超时/
  );
  assert.equal(calls.length, 1);

  globalThis.fetch = originalFetch;
  calls.length = 0;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });

    return new Response(JSON.stringify({
      ok: true,
      success: true,
      data: {
        answer: "AI 回答",
        customer_answer: "您好，AI 回答可以直接发给客户。",
        conversation_id: "conv_2",
        message_id: "msg_2",
        mode: "fast",
        sources: [],
        confidence: "medium",
        provider_status: "provider_not_configured"
      }
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }) as typeof fetch;

  const askResult = await askChat({
    text: "你好",
    attachments: [{
      ...imageAttachment,
      url: "/uploads/chat-attachments/photo.jpg",
      publicUrl: "/uploads/chat-attachments/photo.jpg",
      fileUrl: "/uploads/chat-attachments/photo.jpg",
      downloadUrl: "/api/ai/chat/attachments/download?key=user_1/2026/06/photo.jpg",
      storage: "netlify-blobs",
      blobKey: "user_1/2026/06/photo.jpg"
    }],
    conversation_id: null,
    mode: "fast",
    enable_deep_thinking: false,
    enable_web_search: false
  });

  assert.equal(askResult.answer, "AI 回答");
  assert.equal(askResult.customer_answer, "您好，AI 回答可以直接发给客户。");
  assert.equal(String(calls[0].input), "/api/ai/chat/ask");
  assert.equal(calls[0].init?.method, "POST");
  assert.equal(calls[0].init?.credentials, "include");
  assert.match(String(calls[0].init?.body), /"question":"你好"/);
  assert.match(String(calls[0].init?.body), /"attachments":\[/);
  assert.match(String(calls[0].init?.body), /"url":"\/uploads\/chat-attachments\/photo\.jpg"/);
  assert.match(String(calls[0].init?.body), /"publicUrl":"\/uploads\/chat-attachments\/photo\.jpg"/);
  assert.match(String(calls[0].init?.body), /"fileUrl":"\/uploads\/chat-attachments\/photo\.jpg"/);
  assert.match(String(calls[0].init?.body), /"downloadUrl":"\/api\/ai\/chat\/attachments\/download\?key=user_1\/2026\/06\/photo\.jpg"/);
  assert.match(String(calls[0].init?.body), /"storage":"netlify-blobs"/);
  assert.match(String(calls[0].init?.body), /"blobKey":"user_1\/2026\/06\/photo\.jpg"/);

  globalThis.fetch = originalFetch;
  calls.length = 0;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });

    return new Response(JSON.stringify({
      ok: true,
      success: true,
      data: {
        attachment: {
          id: "uploaded_1",
          name: "photo.jpg",
          filename: "photo.jpg",
          type: "image",
          mimeType: "image/jpeg",
          mime_type: "image/jpeg",
          size: 5,
          url: "/uploads/chat-attachments/uploaded-photo.jpg",
          publicUrl: "/uploads/chat-attachments/uploaded-photo.jpg",
          fileUrl: "/uploads/chat-attachments/uploaded-photo.jpg",
          downloadUrl: "/api/ai/chat/attachments/download?key=user_1/2026/06/uploaded-photo.jpg",
          storage: "netlify-blobs",
          blobKey: "user_1/2026/06/uploaded-photo.jpg",
          reference_id: "uploaded-photo.jpg"
        }
      }
    }), {
      status: 201,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }) as typeof fetch;

  const uploadedAttachment = await uploadChatAttachment(imageAttachment);

  assert.equal(String(calls[0].input), "/api/ai/chat/attachments");
  assert.equal(calls[0].init?.method, "POST");
  assert.equal(calls[0].init?.credentials, "include");
  assert.equal(calls[0].init?.headers, undefined);
  assert.ok(calls[0].init?.body instanceof FormData);
  assert.equal((calls[0].init?.body as FormData).get("file"), imageAttachment.file);
  assert.equal((calls[0].init?.body as FormData).get("attachment"), imageAttachment.file);
  assert.equal((calls[0].init?.body as FormData).get("attachments"), imageAttachment.file);
  assert.equal(uploadedAttachment.url, "/uploads/chat-attachments/uploaded-photo.jpg");
  assert.equal(uploadedAttachment.publicUrl, "/uploads/chat-attachments/uploaded-photo.jpg");
  assert.equal(uploadedAttachment.fileUrl, "/uploads/chat-attachments/uploaded-photo.jpg");
  assert.equal(uploadedAttachment.downloadUrl, "/api/ai/chat/attachments/download?key=user_1/2026/06/uploaded-photo.jpg");
  assert.equal(uploadedAttachment.storage, "netlify-blobs");
  assert.equal(uploadedAttachment.blobKey, "user_1/2026/06/uploaded-photo.jpg");
  assert.equal(uploadedAttachment.previewUrl, "blob:chat-image-preview");

  calls.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });

    return new Response(JSON.stringify({
      ok: false,
      success: false,
      code: "UNAUTHORIZED",
      error: "UNAUTHORIZED",
      message: "请先登录后再上传文件。"
    }), {
      status: 401,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }) as typeof fetch;

  await assert.rejects(
    () => uploadChatAttachment(imageAttachment),
    /文件上传失败：未登录，请重新登录。/
  );
  assert.equal(String(calls[0].input), "/api/ai/chat/attachments");
  assert.equal(calls[0].init?.credentials, "include");
  assert.equal(calls[0].init?.headers, undefined);

  globalThis.fetch = (async () => new Response(JSON.stringify({
    ok: false,
    error: {
      message: "internal stack should not be shown"
    }
  }), {
    status: 401,
    headers: {
      "Content-Type": "application/json"
    }
  })) as typeof fetch;

  await assert.rejects(
    () => askChat({
      text: "你好",
      attachments: [],
      conversation_id: null,
      mode: "fast",
      enable_deep_thinking: false,
      enable_web_search: false
    }),
    /请先登录/
  );

  globalThis.fetch = (async () => new Response(JSON.stringify({
    ok: false,
    error: {
      message: "forbidden details"
    }
  }), {
    status: 403,
    headers: {
      "Content-Type": "application/json"
    }
  })) as typeof fetch;

  await assert.rejects(
    () => askChat({
      text: "你好",
      attachments: [],
      conversation_id: null,
      mode: "fast",
      enable_deep_thinking: false,
      enable_web_search: false
    }),
    /没有权限/
  );

  globalThis.fetch = originalFetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });

    return new Response(JSON.stringify({
      ok: true,
      success: true,
      data: {
        avatar_url: "/uploads/avatars/user_1.png"
      }
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }) as typeof fetch;

  const avatarResult = await updateCurrentUserAvatar(validAvatarFile);

  assert.equal(avatarResult.avatar_url, "/uploads/avatars/user_1.png");
  assert.equal(String(calls.at(-1)?.input), "/api/auth/avatar");
  assert.equal(calls.at(-1)?.init?.method, "POST");
  assert.ok(calls.at(-1)?.init?.body instanceof FormData);
  assert.equal((calls.at(-1)?.init?.body as FormData).get("avatar"), validAvatarFile);
  assert.equal((calls.at(-1)?.init?.body as FormData).get("file"), validAvatarFile);

  globalThis.fetch = originalFetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });

    return new Response(JSON.stringify({
      ok: true,
      success: true,
      data: {
        changed: true
      }
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }) as typeof fetch;

  const passwordResult = await changeCurrentUserPassword({
    currentPassword: "old-password",
    newPassword: "new-password",
    confirmPassword: "new-password"
  });

  assert.equal(passwordResult.changed, true);
  assert.equal(String(calls.at(-1)?.input), "/api/auth/change-password");
  assert.equal(calls.at(-1)?.init?.method, "POST");
  assert.match(String(calls.at(-1)?.init?.body), /"current_password":"old-password"/);
  assert.doesNotMatch(String(calls.at(-1)?.input), /\/api\/admin/);

  globalThis.fetch = originalFetch;

  const categoryCalls: Array<RequestInfo | URL> = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    categoryCalls.push(input);

    return new Response(JSON.stringify({
    ok: true,
    success: true,
    data: {
      quickActions: [
        {
          id: "quick-second",
          name: "排序第二",
          prompt: "第二个提示词",
          action: "fill_prompt",
          enabled: true,
          sortOrder: 2
        },
        {
          id: "quick-disabled",
          name: "禁用分类",
          prompt: "不应显示",
          action: "fill_prompt",
          enabled: false,
          sortOrder: 1
        },
        {
          id: "quick-first",
          name: "排序第一",
          prompt: "第一个提示词",
          action: "send_prompt",
          icon: "zap",
          type: "prompt",
          enabled: true,
          sortOrder: 1
        }
      ]
    }
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  });
  }) as typeof fetch;

  const quickCategories = await fetchQuickActionCategories();

  assert.equal(quickCategories.length, 2);
  assert.equal(quickCategories[0].label, "排序第一");
  assert.equal(quickCategories[0].prompt, "第一个提示词");
  assert.equal(quickCategories[0].action, "send_prompt");
  assert.equal(quickCategories[0].icon, "zap");
  assert.equal(quickCategories[1].label, "排序第二");
  assert.equal(quickCategories.some((item) => item.label === "禁用分类"), false);
  assert.equal(quickCategories[0].kind, "category");
  assert.equal(String(categoryCalls[0]), "/api/user/quick-actions");

  globalThis.fetch = (async () => new Response(JSON.stringify({
    ok: true,
    success: true,
    data: {
      quickActions: []
    }
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  })) as typeof fetch;

  assert.deepEqual(await fetchQuickActionCategories(), []);

  globalThis.fetch = (async () => new Response(JSON.stringify({
    ok: false,
    success: false,
    error: {
      message: "forbidden"
    }
  }), {
    status: 403,
    headers: {
      "Content-Type": "application/json"
    }
  })) as typeof fetch;

  assert.deepEqual(await fetchQuickActionCategories(), []);

  globalThis.fetch = originalFetch;

  for (const userClientFile of [
    "app/(user)/chat-ui/api.ts",
    "app/(user)/chat-ui/components/ChatShell.tsx",
    "app/(user)/chat-ui/components/ChatInput.tsx",
    "app/(user)/chat-ui/components/ChatMessages.tsx",
    "app/(user)/chat-ui/components/AvatarSettingsDialog.tsx"
  ]) {
    const fileText = readFileSync(userClientFile, "utf8");

    assert.doesNotMatch(fileText, /\/api\/admin\/kb\//);
  }

  const avatarRouteText = readFileSync("app/api/auth/avatar/route.ts", "utf8");
  const chatAttachmentRouteText = readFileSync("app/api/ai/chat/attachments/route.ts", "utf8");
  const chatAttachmentDownloadRouteText = readFileSync("app/api/ai/chat/attachments/download/route.ts", "utf8");
  const aiChatAskText = readFileSync("lib/ai-chat/ask.ts", "utf8");
  const changePasswordRouteText = readFileSync("app/api/auth/change-password/route.ts", "utf8");

  assert.match(avatarRouteText, /formData\.get\("avatar"\)\s*\?\?\s*formData\.get\("file"\)/);
  assert.match(avatarRouteText, /data:\$\{mimeType\};base64/);
  assert.match(chatAttachmentRouteText, /function getFirstUploadedFile\(formData: FormData\)/);
  assert.match(chatAttachmentRouteText, /\["file", "files", "attachment", "attachments"\]/);
  assert.match(chatAttachmentRouteText, /path\.join\(uploadRoot, "chat-attachments"\)/);
  assert.match(chatAttachmentRouteText, /@netlify\/blobs/);
  assert.match(chatAttachmentRouteText, /getStore/);
  assert.match(chatAttachmentRouteText, /CHAT_ATTACHMENT_STORE_NAME\s*=\s*"chat-attachments"/);
  assert.match(chatAttachmentRouteText, /NETLIFY_BLOBS_SITE_ID/);
  assert.match(chatAttachmentRouteText, /NETLIFY_BLOBS_TOKEN/);
  assert.match(chatAttachmentRouteText, /文件上传服务未配置：缺少 Netlify Blobs 环境变量。/);
  assert.match(chatAttachmentRouteText, /CHAT_ATTACHMENT_STORAGE\?\.trim\(\) !== "netlify-blobs"/);
  assert.match(chatAttachmentRouteText, /saveAttachmentToLocalPublicUploads/);
  assert.match(chatAttachmentRouteText, /saveAttachmentToNetlifyBlobs/);
  assert.match(chatAttachmentRouteText, /store\.set\(blobKey,\s*input\.arrayBuffer/);
  assert.match(chatAttachmentRouteText, /metadata:\s*\{\s*contentType:\s*input\.mimeType/);
  assert.match(chatAttachmentRouteText, /\/api\/ai\/chat\/attachments\/download\?key=/);
  assert.doesNotMatch(chatAttachmentRouteText, /当前部署环境无法保存附件/);
  assert.doesNotMatch(chatAttachmentRouteText, /downloadUrl[\s\S]{0,160}token/i);
  assert.match(chatAttachmentRouteText, /inferAttachmentMimeType/);
  assert.match(chatAttachmentRouteText, /application\/octet-stream/);
  assert.match(chatAttachmentRouteText, /请先登录后再上传文件。/);
  assert.match(chatAttachmentRouteText, /application\/vnd\.ms-powerpoint/);
  assert.match(chatAttachmentRouteText, /application\/vnd\.openxmlformats-officedocument\.presentationml\.presentation/);
  assert.match(chatAttachmentRouteText, /application\/vnd\.ms-excel/);
  assert.match(chatAttachmentRouteText, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.match(chatAttachmentRouteText, /MAX_CHAT_ATTACHMENT_SIZE_MB\s*=\s*300/);
  assert.match(chatAttachmentRouteText, /单个附件不能超过 \$\{MAX_CHAT_ATTACHMENT_SIZE_MB\}MB/);
  assert.match(chatAttachmentRouteText, /url:\s*savedAttachment\.url/);
  assert.match(chatAttachmentRouteText, /publicUrl:\s*savedAttachment\.url/);
  assert.match(chatAttachmentRouteText, /fileUrl:\s*savedAttachment\.url/);
  assert.match(chatAttachmentRouteText, /storage:\s*savedAttachment\.storage/);
  assert.match(chatAttachmentRouteText, /blobKey:\s*savedAttachment\.blobKey/);
  assert.match(chatAttachmentRouteText, /const downloadUrl = savedAttachment\.blobKey/);
  assert.match(chatAttachmentRouteText, /attachment:\s*responseData\.attachment/);
  assert.doesNotMatch(avatarRouteText, /knowledge_files|ingestion_jobs|knowledge_chunks|\/api\/admin/);
  assert.doesNotMatch(chatAttachmentRouteText, /knowledge_files|ingestion_jobs|knowledge_chunks|\/api\/admin/);
  assert.match(chatAttachmentDownloadRouteText, /CHAT_ATTACHMENT_STORE_NAME\s*=\s*"chat-attachments"/);
  assert.match(chatAttachmentDownloadRouteText, /requireAiChatAccess\(request, "ai_chat_attachment_download"\)/);
  assert.match(chatAttachmentDownloadRouteText, /safeBlobKeyPattern/);
  assert.match(chatAttachmentDownloadRouteText, /safeLocalPublicAttachmentKeyPattern/);
  assert.match(chatAttachmentDownloadRouteText, /readLocalPublicAttachment/);
  assert.match(chatAttachmentDownloadRouteText, /key\.startsWith\(`\$\{getSafeUserPrefix\(actorId\)\}-`\)/);
  assert.match(chatAttachmentDownloadRouteText, /key\.startsWith\(`\$\{getSafeUserPrefix\(actor\.id\)\}\/`\)/);
  assert.match(chatAttachmentDownloadRouteText, /getWithMetadata\(key/);
  assert.match(chatAttachmentDownloadRouteText, /type:\s*"arrayBuffer"/);
  assert.match(chatAttachmentDownloadRouteText, /metadataUserId !== actor\.id/);
  assert.match(chatAttachmentDownloadRouteText, /Content-Type/);
  assert.match(chatAttachmentDownloadRouteText, /Content-Disposition/);
  assert.doesNotMatch(chatAttachmentDownloadRouteText, /knowledge_files|ingestion_jobs|knowledge_chunks|\/api\/admin/);
  assert.doesNotMatch(chatAttachmentDownloadRouteText, /NETLIFY_BLOBS_TOKEN[\s\S]{0,260}Response/);
  assert.match(aiChatAskText, /cleanPersistentAttachmentUrl/);
  assert.match(aiChatAskText, /url:\s*cleanPersistentAttachmentUrl\(record\.url\)/);
  assert.match(aiChatAskText, /publicUrl:\s*cleanPersistentAttachmentUrl\(record\.publicUrl\)/);
  assert.match(aiChatAskText, /fileUrl:\s*cleanPersistentAttachmentUrl\(record\.fileUrl\)/);
  assert.match(aiChatAskText, /downloadUrl:\s*cleanPersistentAttachmentUrl\(record\.downloadUrl\)/);
  assert.match(aiChatAskText, /storage:\s*trimString\(record\.storage\)/);
  assert.match(aiChatAskText, /blobKey:\s*trimString\(record\.blobKey\)/);
  assert.doesNotMatch(aiChatAskText, /knowledge_files|ingestion_jobs|knowledge_chunks|\/api\/admin\/kb/);
  assert.doesNotMatch(changePasswordRouteText, /knowledge_files|ingestion_jobs|knowledge_chunks|\/api\/admin/);
  assert.doesNotMatch(readFileSync("prisma/schema.prisma", "utf8"), /avatar_url|avatarUrl/);
  assert.equal(readdirSync("prisma/migrations").some((name) => /avatar|profile/i.test(name)), false);
  const middlewareText = readFileSync("middleware.ts", "utf8");

  assert.match(middlewareText, /pathname === "\/chat-ui"/);
  assert.match(middlewareText, /camera=\(self\), microphone=\(self\), geolocation=\(\)/);

  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;

  console.log("Chat UI tests passed.");
}

void main();
