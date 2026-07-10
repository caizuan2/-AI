import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  askChat,
  changeCurrentUserPassword,
  fetchConversationHistory,
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
import {
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

  const chatUiPageSource = readFileSync("app/(user)/chat-ui/page.tsx", "utf8");

  assert.match(chatUiPageSource, /<ClientAuthGate>/);
  assert.match(chatUiPageSource, /<ChatShell \/>/);

  const shellMarkup = renderToStaticMarkup(<ChatShell />);

  assert.match(shellMarkup, /Hi，我是你的沟通助手/);
  assert.match(shellMarkup, /打开历史会话/);
  assert.match(shellMarkup, /新建对话/);
  assert.doesNotMatch(shellMarkup, /语音输入/);
  assert.match(shellMarkup, /打开上传菜单/);
  assert.match(shellMarkup, /发送消息/);
  assert.doesNotMatch(shellMarkup, /aria-label="打开相机"/);
  assert.doesNotMatch(shellMarkup, /11:54/);
  assert.doesNotMatch(shellMarkup, /⌁/);
  assert.doesNotMatch(shellMarkup, /麦克风权限未开启/);
  const chatShellSource = readFileSync("app/(user)/chat-ui/components/ChatShell.tsx", "utf8");

  assert.match(chatShellSource, /已打开扫描入口/);
  assert.match(chatShellSource, /已选择扫描图片/);
  assert.match(chatShellSource, /已打开通知面板/);
  assert.match(chatShellSource, /historyRequestIdRef/);
  assert.match(chatShellSource, /setConversationId\(nextConversationId\)/);
  assert.match(chatShellSource, /fetchConversationHistory\(nextConversationId\)/);
  assert.match(chatShellSource, /setMessages\(Array\.isArray\(history\.messages\)/);
  assert.match(chatShellSource, /uploadChatAttachments\(attachments\)/);
  assert.ok(
    chatShellSource.indexOf("uploadChatAttachments(attachments)") < chatShellSource.indexOf("askChatStream({")
  );
  assert.match(chatShellSource, /IMAGE_ONLY_DEFAULT_PROMPT/);
  assert.match(chatShellSource, /const canSubmit = Boolean\(text\) \|\| hasImageAttachment/);
  assert.match(chatShellSource, /const askText = text \|\| IMAGE_ONLY_DEFAULT_PROMPT/);
  assert.match(chatShellSource, /text: askText/);
  assert.match(chatShellSource, /createUserMessage\(text, uploadedAttachments\)/);
  assert.doesNotMatch(chatShellSource, /文件上传失败，请重新选择后再发送/);
  assert.doesNotMatch(chatShellSource, /请先输入问题，再随问题一起发送附件/);
  assert.match(chatShellSource, /inputCleared/);
  assert.match(chatShellSource, /setInput\(text\)/);
  assert.match(chatShellSource, /正在加载历史记录/);
  assert.match(chatShellSource, /该会话暂无消息/);
  assert.match(chatShellSource, /historyLoadError/);

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

  const chatInputMarkup = renderToStaticMarkup(
    <ChatInput
      value=""
      loading={false}
      onValueChange={() => undefined}
      onSubmit={() => undefined}
      onStatusMessage={() => undefined}
    />
  );

  assert.match(chatInputMarkup, /accept="image\/\*"/);
  assert.match(chatInputMarkup, new RegExp(`accept="${CHAT_FILE_ACCEPT.replace(/\*/g, "\\*").replace(/\./g, "\\.")}"`));
  assert.match(chatInputMarkup, /multiple=""/);
  assert.match(chatInputMarkup, /capture="environment"/);
  assert.match(chatInputMarkup, /aria-label="打开上传菜单"/);
  assert.match(chatInputMarkup, /aria-label="发送消息"/);
  assert.doesNotMatch(chatInputMarkup, /aria-label="语音输入"/);
  assert.doesNotMatch(chatInputMarkup, /aria-label="停止语音输入"/);
  assert.match(chatInputMarkup, /disabled=""/);
  assert.match(chatInputMarkup, /bg-slate-200/);
  assert.doesNotMatch(chatInputMarkup, /麦克风权限未开启/);
  assert.doesNotMatch(chatInputMarkup, /aria-label="打开相机"/);
  const chatInputComponentSource = readFileSync("app/(user)/chat-ui/components/ChatInput.tsx", "utf8");

  assert.match(chatInputComponentSource, /onFileUpload=\{\(\) => fileInputRef\.current\?\.click\(\)\}/);
  assert.match(chatInputComponentSource, /onCameraOpen=\{\(\) => cameraInputRef\.current\?\.click\(\)\}/);
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
  assert.match(chatShellText, /pendingScrollToUserMessageIdRef\.current = nextUserMessage\.id/);
  assert.match(chatShellText, /setScrollFocusMessageId\(nextUserMessage\.id\)/);
  assert.match(chatShellText, /scrollChatMessageToTop\(targetMessageId, "auto"\)/);
  assert.match(chatShellText, /PROMPT_HISTORY_RAIL_MARK_COUNT/);
  assert.match(chatShellText, /type PromptHistoryItem =/);
  assert.match(chatShellText, /function buildPromptHistoryItems\(messages: ChatMessageView\[\]\): PromptHistoryItem\[\]/);
  assert.match(chatShellText, /const promptHistory = React\.useMemo\(\(\) => buildPromptHistoryItems\(messages\), \[messages\]\)/);
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

  const historyResult = await fetchConversationHistory("conv_2");

  assert.equal(String(calls.at(-1)?.input), "/api/ai/chat/history?conversation_id=conv_2");
  assert.equal(calls.at(-1)?.init?.method, "GET");
  assert.equal(historyResult.conversation.id, "conv_2");
  assert.equal(historyResult.messages[0].content, "联创历史问题");

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
