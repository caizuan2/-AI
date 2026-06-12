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
  getCurrentChatUserAccount,
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
  CustomerAnswerCard,
  copyCustomerAnswerToClipboard
} from "../app/(user)/chat-ui/components/CustomerAnswerCard";
import { copyAnswerSectionToClipboard } from "../app/(user)/chat-ui/components/AnswerSectionCard";
import {
  buildRichAnswerSections,
  splitCustomerAnswerParagraphs
} from "../app/(user)/chat-ui/lib/answer-format";

async function main() {
  const chatUiPageSource = readFileSync("app/(user)/chat-ui/page.tsx", "utf8");

  assert.match(chatUiPageSource, /<ClientAuthGate>/);
  assert.match(chatUiPageSource, /<ChatShell \/>/);

  const shellMarkup = renderToStaticMarkup(<ChatShell />);

  assert.match(shellMarkup, /使用快速模式开始对话/);
  assert.match(shellMarkup, /新对话/);
  assert.match(shellMarkup, /内容由 AI 生成/);
  assert.match(shellMarkup, /打开历史会话/);
  assert.match(shellMarkup, /新建对话/);
  assert.match(shellMarkup, /快速/);
  assert.match(shellMarkup, /AI 创作/);
  assert.match(shellMarkup, /照片动起来/);
  assert.match(shellMarkup, /视频通话/);
  assert.match(shellMarkup, /发消息或按住说话/);
  assert.match(shellMarkup, /语音输入/);
  assert.match(shellMarkup, /打开上传菜单/);
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
    chatShellSource.indexOf("uploadChatAttachments(attachments)") < chatShellSource.indexOf("askChat({")
  );
  assert.match(chatShellSource, /正在加载历史记录/);
  assert.match(chatShellSource, /该会话暂无消息/);
  assert.match(chatShellSource, /历史记录加载失败，请稍后重试/);

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

  assert.doesNotMatch(quickActionsMarkup, /AI 创作/);
  assert.match(quickActionsMarkup, /专家/);
  assert.match(quickActionsMarkup, /深度思考/);
  assert.match(quickActionsMarkup, /智能搜索/);
  assert.match(quickActionsMarkup, /售后/);

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

  assert.match(fallbackQuickActionsMarkup, /快速/);
  assert.match(fallbackQuickActionsMarkup, /AI 创作/);
  assert.match(fallbackQuickActionsMarkup, /照片动起来/);
  assert.match(fallbackQuickActionsMarkup, /视频通话/);

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
  assert.match(drawerMarkup, /AI 知识库/);
  assert.match(drawerMarkup, /AI 内容获客系统设计框架与路径/);
  assert.match(drawerMarkup, /企业科技化转型与授信获取/);
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
  assert.equal(USER_CHAT_LOGIN_URL, "/login?app=user&next=/chat-ui");
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
  assert.match(chatInputMarkup, /capture="environment"/);
  assert.doesNotMatch(chatInputMarkup, /麦克风权限未开启/);

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
  assert.match(selectedAttachmentMarkup, /删除附件 contract\.pdf/);
  assert.equal(validateChatAttachmentFile(new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.pdf", {
    type: "application/pdf"
  })), "单个附件不能超过 10MB。");
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
  assert.match(chatInputSource, /h-7 w-7/);
  assert.match(chatInputSource, /border border-slate-950/);
  assert.doesNotMatch(chatInputSource, /border-2 border-slate-950/);
  assert.match(chatInputSource, /<Plus className="h-3\.5 w-3\.5" strokeWidth=\{1\.9\}/);

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
  assert.match(readFileSync("app/(user)/chat-ui/components/ChatShell.tsx", "utf8"), /setCurrentUser/);
  assert.match(readFileSync("app/(user)/chat-ui/components/ChatShell.tsx", "utf8"), /avatar_url:\s*nextAvatarUrl/);
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
    assert.match(readFileSync(routeFile, "utf8"), /requireLicense:\s*true/);
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

  assert.match(modeMarkup, /快速模式/);
  assert.match(modeMarkup, /专家模式/);
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
      publicUrl: "/uploads/chat-attachments/photo.jpg"
    }],
    conversation_id: "conv_1",
    mode: "fast",
    enable_deep_thinking: false,
    enable_web_search: false
  });

  assert.equal(uploadedImagePayload.attachments[0].url, "/uploads/chat-attachments/photo.jpg");
  assert.equal(uploadedImagePayload.attachments[0].publicUrl, "/uploads/chat-attachments/photo.jpg");
  assert.equal(uploadedImagePayload.attachments[0].metadata.url, "/uploads/chat-attachments/photo.jpg");
  assert.equal(uploadedImagePayload.attachments[0].metadata.publicUrl, "/uploads/chat-attachments/photo.jpg");

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

  assert.match(chatMessagesSource, /图片加载失败/);
  assert.match(chatMessagesSource, /图片预览不可用/);
  assert.match(chatMessagesSource, /function UserMessageBlock/);
  assert.match(chatMessagesSource, /function UserMessageActions/);
  assert.match(chatMessagesSource, /onEditUserMessage\?\.\(message\.content\)/);
  assert.match(chatMessagesSource, /onError=\{\(\) => setFailed\(true\)\}/);
  assert.match(chatMessagesSource, /attachment\.src/);
  assert.match(chatMessagesSource, /attachment\.dataUrl/);
  assert.match(chatMessagesSource, /attachment\.fileUrl/);
  assert.match(chatMessagesSource, /attachment\.publicUrl/);
  assert.match(chatMessagesSource, /attachment\.downloadUrl/);
  assert.match(chatMessagesSource, /attachment\.path/);
  assert.match(chatMessagesSource, /attachment\.storagePath/);
  const chatShellSourceForEdit = readFileSync("app/(user)/chat-ui/components/ChatShell.tsx", "utf8");

  assert.match(chatShellSourceForEdit, /function handleEditUserMessage/);
  assert.match(chatShellSourceForEdit, /setInput\(content\)/);
  assert.match(chatShellSourceForEdit, /onEditUserMessage=\{handleEditUserMessage\}/);
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
              name: "lost-photo.jpg"
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
  assert.match(historyImageMarkup, /lost-photo\.jpg/);
  assert.match(historyImageMarkup, /图片预览不可用/);
  assert.match(historyImageMarkup, /contract\.pdf/);
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
  assert.match(chatMessagesMarkup, /现在建议你这样回复/);
  assert.match(chatMessagesMarkup, /以下内容基于知识库资料整理/);
  assert.match(chatMessagesMarkup, /核心判断/);
  assert.match(chatMessagesMarkup, /为什么/);
  assert.match(chatMessagesMarkup, /怎么做/);
  assert.match(chatMessagesMarkup, /可直接复制给客户/);
  assert.match(chatMessagesMarkup, /复制全部话术/);
  assert.match(chatMessagesMarkup, /复制本段/);
  assert.doesNotMatch(chatMessagesMarkup, /RAG confidence/);
  assert.doesNotMatch(chatMessagesMarkup, /来源/);
  assert.doesNotMatch(chatMessagesMarkup, /chunk: chunk_1/);
  assert.doesNotMatch(chatMessagesMarkup, /82%/);

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
      publicUrl: "/uploads/chat-attachments/photo.jpg"
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
  assert.match(String(calls[0].init?.body), /"question":"你好"/);
  assert.match(String(calls[0].init?.body), /"attachments":\[/);
  assert.match(String(calls[0].init?.body), /"url":"\/uploads\/chat-attachments\/photo\.jpg"/);
  assert.match(String(calls[0].init?.body), /"publicUrl":"\/uploads\/chat-attachments\/photo\.jpg"/);

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
  assert.ok(calls[0].init?.body instanceof FormData);
  assert.equal((calls[0].init?.body as FormData).get("file"), imageAttachment.file);
  assert.equal((calls[0].init?.body as FormData).get("attachment"), imageAttachment.file);
  assert.equal(uploadedAttachment.url, "/uploads/chat-attachments/uploaded-photo.jpg");
  assert.equal(uploadedAttachment.publicUrl, "/uploads/chat-attachments/uploaded-photo.jpg");
  assert.equal(uploadedAttachment.previewUrl, "blob:chat-image-preview");

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
  const aiChatAskText = readFileSync("lib/ai-chat/ask.ts", "utf8");
  const changePasswordRouteText = readFileSync("app/api/auth/change-password/route.ts", "utf8");

  assert.match(avatarRouteText, /formData\.get\("avatar"\)\s*\?\?\s*formData\.get\("file"\)/);
  assert.match(avatarRouteText, /data:\$\{avatar\.type\};base64/);
  assert.match(chatAttachmentRouteText, /formData\.get\("file"\)\s*\?\?\s*formData\.get\("attachment"\)/);
  assert.match(chatAttachmentRouteText, /public", "uploads", "chat-attachments"/);
  assert.match(aiChatAskText, /persistedAttachmentUrlKeys/);
  assert.match(aiChatAskText, /normalizeStoredAttachments/);
  assert.doesNotMatch(avatarRouteText, /knowledge_files|ingestion_jobs|knowledge_chunks|\/api\/admin/);
  assert.doesNotMatch(chatAttachmentRouteText, /knowledge_files|ingestion_jobs|knowledge_chunks|\/api\/admin/);
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
