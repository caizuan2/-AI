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
  getMicrophoneAccessErrorMessage,
  getSpeechRecognitionErrorMessage,
  mergeVoiceTranscript,
  readSpeechRecognitionTranscript,
  removeChatAttachment,
  SelectedAttachmentList,
  SPEECH_NO_MICROPHONE_MESSAGE,
  SPEECH_PERMISSION_MESSAGE,
  SPEECH_RECORDING_ONLY_MESSAGE,
  SPEECH_UNSUPPORTED_MESSAGE,
  validateChatAttachmentFile
} from "../app/(user)/chat-ui/components/ChatInput";
import { ChatShell } from "../app/(user)/chat-ui/components/ChatShell";
import {
  ChatMessages,
  copyUserMessageToClipboard,
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

  const chatUiPageSource = readFileSync("app/(user)/chat-ui/page.tsx", "utf8");

  assert.match(chatUiPageSource, /<ClientAuthGate>/);
  assert.match(chatUiPageSource, /<ChatShell \/>/);

  const shellMarkup = renderToStaticMarkup(<ChatShell />);

  assert.match(shellMarkup, /Hi，我是你的沟通助手/);
  assert.match(shellMarkup, /打开历史会话/);
  assert.match(shellMarkup, /新建对话/);
  assert.match(shellMarkup, /语音输入/);
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
  assert.doesNotMatch(chatShellSource, /文件上传失败，请重新选择后再发送/);
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

  assert.match(attachmentMenuMarkup, /上传手机照片/);
  assert.match(attachmentMenuMarkup, /上传文件/);
  assert.match(attachmentMenuMarkup, /打开相机/);
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
  assert.match(selectedAttachmentMarkup, /photo\.jpg/);
  assert.match(selectedAttachmentMarkup, /contract\.pdf/);
  assert.match(selectedAttachmentMarkup, /1KB/);
  assert.match(selectedAttachmentMarkup, /删除附件 contract\.pdf/);
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
  assert.equal(mergeVoiceTranscript("已有内容", "  继续提问  "), "已有内容 继续提问");
  assert.equal(SPEECH_UNSUPPORTED_MESSAGE, "当前环境暂不支持语音输入，请使用文字输入。");
  assert.equal(SPEECH_RECORDING_ONLY_MESSAGE, "当前环境可使用麦克风，但暂不支持语音转文字，请使用文字输入。");
  assert.equal(getSpeechRecognitionErrorMessage("not-allowed"), SPEECH_RECORDING_ONLY_MESSAGE);
  assert.equal(getSpeechRecognitionErrorMessage("service-not-allowed"), SPEECH_RECORDING_ONLY_MESSAGE);
  assert.equal(getSpeechRecognitionErrorMessage("audio-capture"), SPEECH_NO_MICROPHONE_MESSAGE);
  assert.equal(getMicrophoneAccessErrorMessage(new DOMException("denied", "NotAllowedError")), SPEECH_PERMISSION_MESSAGE);
  assert.equal(getMicrophoneAccessErrorMessage({ name: "PermissionDeniedError" }), SPEECH_PERMISSION_MESSAGE);
  assert.equal(getMicrophoneAccessErrorMessage(new DOMException("not found", "NotFoundError")), SPEECH_NO_MICROPHONE_MESSAGE);
  assert.equal(readSpeechRecognitionTranscript({
    results: [
      {
        0: {
          transcript: "临时内容"
        },
        isFinal: false
      },
      {
        0: {
          transcript: "最终内容"
        },
        isFinal: true
      }
    ]
  }).finalTranscript, "最终内容");
  const chatInputSource = readFileSync("app/(user)/chat-ui/components/ChatInput.tsx", "utf8");

  assert.match(chatInputSource, /recognition\.interimResults\s*=\s*true/);
  assert.match(chatInputSource, /recognition\.continuous\s*=\s*false/);
  assert.match(chatInputSource, /recognitionRef\.current\?\.stop\(\)/);
  assert.match(chatInputSource, /navigator\.mediaDevices\?\.getUserMedia/);
  assert.match(chatInputSource, /getUserMedia\(\{\s*audio:\s*true\s*\}\)/);
  assert.ok(
    chatInputSource.indexOf("getUserMedia({ audio: true })") < chatInputSource.indexOf("const speechWindow = window as SpeechWindow;")
  );
  assert.match(chatInputSource, /SPEECH_RECORDING_ONLY_MESSAGE/);
  assert.match(chatInputSource, /麦克风已开启，正在启动语音识别/);
  assert.match(chatInputSource, /onStatusMessage\?\.\("正在听\.\.\."\)/);
  assert.match(chatInputSource, /const hasText = value\.trim\(\)\.length > 0/);
  assert.match(chatInputSource, /const canSend = hasText && !loading/);
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

  assert.match(chatShellText, /setCurrentUser/);
  assert.match(chatShellText, /writeStoredAvatarUrl\(currentUser, nextAvatarUrl\)/);
  assert.match(chatShellText, /mergeCurrentUserAvatar\(user, nextAvatarUrl\)/);
  assert.match(chatShellText, /stableAvatarUrl = nextAvatarUrl === null \? null : refreshedAvatarUrl \|\| nextAvatarUrl/);
  assert.match(chatShellText, /mergeCurrentUserAvatar\(\{[\s\S]*stableAvatarUrl\)/);
  assert.match(chatShellText, /pendingScrollToUserMessageIdRef\.current = nextUserMessage\.id/);
  assert.match(chatShellText, /setScrollFocusMessageId\(nextUserMessage\.id\)/);
  assert.match(chatShellText, /scrollChatMessageToTop\(targetMessageId, "auto"\)/);
  assert.match(chatShellText, /PROMPT_HISTORY_STORAGE_KEY_PREFIX/);
  assert.match(chatShellText, /<PromptHistoryRail prompts=\{promptHistory\}/);
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
  assert.match(chatMessagesMarkup, /打开图片预览 photo\.jpg/);
  assert.match(chatMessagesMarkup, /<img/);
  assert.match(chatMessagesMarkup, /blob:chat-image-preview/);
  assert.match(chatMessagesMarkup, /contract\.pdf/);
  assert.match(chatMessagesMarkup, /aria-label="复制用户消息"/);
  assert.match(chatMessagesMarkup, /aria-label="编辑用户消息"/);
  assert.ok(
    chatMessagesMarkup.indexOf("打开图片预览 photo.jpg") < chatMessagesMarkup.indexOf("退款流程怎么处理？")
  );
  assert.ok(
    chatMessagesMarkup.indexOf("退款流程怎么处理？") < chatMessagesMarkup.indexOf("aria-label=\"复制用户消息\"")
  );
  assert.ok(
    chatMessagesMarkup.indexOf("bg-slate-100") < chatMessagesMarkup.indexOf("bg-blue-600")
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
  }), "photo.jpg");
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
  assert.match(chatMessagesSource, /图片加载失败/);
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
  assert.match(chatMessagesSource, /onError=\{\(\) => setFailed\(true\)\}/);
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
  assert.match(chatShellSourceForEdit, /mergeCurrentUserAvatar\(user, nextAvatarUrl\)/);
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

  assert.match(historyImageMarkup, /打开图片预览 preview-photo\.jpg/);
  assert.match(historyImageMarkup, /blob:history-preview-url/);
  assert.match(historyImageMarkup, /打开图片预览 url-photo\.jpg/);
  assert.match(historyImageMarkup, /\/uploads\/url-photo\.jpg/);
  assert.match(historyImageMarkup, /打开图片预览 history-photo\.png/);
  assert.match(historyImageMarkup, /https:\/\/example\.com\/history-photo\.png/);
  assert.match(historyImageMarkup, /打开图片预览 metadata-photo\.webp/);
  assert.match(historyImageMarkup, /data:image\/webp;base64,AAAA/);
  assert.match(historyImageMarkup, /打开图片预览 metadata-url-photo\.jpg/);
  assert.match(historyImageMarkup, /\/uploads\/metadata-url-photo\.jpg/);
  assert.match(historyImageMarkup, /打开图片预览 file-url-photo\.jpg/);
  assert.match(historyImageMarkup, /\/uploads\/file-url-photo\.jpg/);
  assert.match(historyImageMarkup, /打开图片预览 public-url-photo\.jpg/);
  assert.match(historyImageMarkup, /https:\/\/example\.com\/public-url-photo\.jpg/);
  assert.match(historyImageMarkup, /打开图片预览 download-url-photo\.jpg/);
  assert.match(historyImageMarkup, /\/api\/files\/download-url-photo\.jpg/);
  assert.match(historyImageMarkup, /打开图片预览 path-photo\.jpg/);
  assert.match(historyImageMarkup, /\/uploads\/path-photo\.jpg/);
  assert.match(historyImageMarkup, /打开图片预览 storage-path-photo\.jpg/);
  assert.match(historyImageMarkup, /\/uploads\/storage-path-photo\.jpg/);
  assert.match(historyImageMarkup, /打开图片预览 cached-photo\.jpg/);
  assert.match(historyImageMarkup, /blob:chat-image-preview/);
  assert.match(historyImageMarkup, /打开图片预览 filename-photo\.png/);
  assert.match(historyImageMarkup, /\/uploads\/filename-photo\.png/);
  assert.match(historyImageMarkup, /打开图片预览 priority-photo\.jpg/);
  assert.match(historyImageMarkup, /\/api\/ai\/chat\/attachments\/download\?key=user_1\/2026\/06\/priority\.jpg/);
  assert.doesNotMatch(historyImageMarkup, /wrong-src-photo|WRONG/);
  assert.match(historyImageMarkup, /打开图片预览 metadata-priority-photo\.jpg/);
  assert.match(historyImageMarkup, /\/api\/ai\/chat\/attachments\/download\?key=user_1\/2026\/06\/metadata-priority\.jpg/);
  assert.doesNotMatch(historyImageMarkup, /wrong-metadata-src-photo/);
  assert.match(historyImageMarkup, /lost-photo\.jpg/);
  assert.match(historyImageMarkup, /图片预览不可用/);
  assert.match(historyImageMarkup, /打开文件 history-contract\.pdf/);
  assert.match(historyImageMarkup, /\/uploads\/chat-attachments\/history-contract\.pdf/);
  assert.match(historyImageMarkup, /2KB/);
  assert.match(historyImageMarkup, /contract\.pdf/);
  assert.match(historyImageMarkup, /文件暂不可预览/);
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

  assert.match(stringAttachmentsMarkup, /打开图片预览 json-string-photo\.jpg/);
  assert.match(stringAttachmentsMarkup, /\/uploads\/json-string-photo\.jpg/);
  assert.match(chatMessagesMarkup, /小董AI/);
  assert.match(chatMessagesMarkup, /退款需要先核对订单号/);
  assert.match(chatMessagesMarkup, /引用来源/);
  assert.match(chatMessagesMarkup, /退款处理流程/);
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
  assert.match(chatAttachmentRouteText, /attachment:\s*responseData\.attachment/);
  assert.doesNotMatch(avatarRouteText, /knowledge_files|ingestion_jobs|knowledge_chunks|\/api\/admin/);
  assert.doesNotMatch(chatAttachmentRouteText, /knowledge_files|ingestion_jobs|knowledge_chunks|\/api\/admin/);
  assert.match(chatAttachmentDownloadRouteText, /CHAT_ATTACHMENT_STORE_NAME\s*=\s*"chat-attachments"/);
  assert.match(chatAttachmentDownloadRouteText, /requireAiChatAccess\(request, "ai_chat_attachment_download"\)/);
  assert.match(chatAttachmentDownloadRouteText, /safeBlobKeyPattern/);
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
