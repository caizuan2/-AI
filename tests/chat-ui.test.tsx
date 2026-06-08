import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ChatUiPage from "../app/(user)/chat-ui/page";
import {
  askChat,
  changeCurrentUserPassword,
  fetchQuickActionCategories,
  updateCurrentUserAvatar,
  USER_CHAT_LOGIN_URL
} from "../app/(user)/chat-ui/api";
import {
  appendAskResult,
  createAskAttachmentPayload,
  createAskRequestPayload,
  createNewChatState,
  createUserMessage,
  getCurrentChatUserAccount,
  getCurrentChatUserDisplayName,
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
  getSpeechRecognitionErrorMessage,
  mergeVoiceTranscript,
  readSpeechRecognitionTranscript,
  removeChatAttachment,
  SelectedAttachmentList,
  SPEECH_PERMISSION_MESSAGE,
  SPEECH_UNSUPPORTED_MESSAGE,
  validateChatAttachmentFile
} from "../app/(user)/chat-ui/components/ChatInput";
import { ChatShell } from "../app/(user)/chat-ui/components/ChatShell";
import { ChatMessages } from "../app/(user)/chat-ui/components/ChatMessages";
import { ChatQuickActions } from "../app/(user)/chat-ui/components/ChatQuickActions";
import { ChatSettingsMenu } from "../app/(user)/chat-ui/components/ChatSettingsMenu";
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
  const pageMarkup = renderToStaticMarkup(<ChatUiPage />);

  assert.match(pageMarkup, /AI 知识库助手/);
  assert.match(pageMarkup, /使用快速模式开始对话/);

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
      userDescription="+8613360587600"
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
  assert.match(drawerMarkup, /\+8613360587600/);
  assert.match(drawerMarkup, /修改头像/);
  assert.doesNotMatch(drawerMarkup, /账号[:：]/);

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
      userDescription="+8613360587600"
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
      userAccount="+8613360587600"
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
      userAccount="+8613360587600"
      onOpenAvatar={() => undefined}
      onLogout={() => undefined}
      onChangePassword={() => undefined}
      onSwitchAccount={() => undefined}
    />
  );

  assert.match(settingsMarkup, /账号信息/);
  assert.match(settingsMarkup, /蔡姑/);
  assert.match(settingsMarkup, /\+8613360587600/);
  assert.match(settingsMarkup, /修改头像/);
  assert.match(settingsMarkup, /退出登录/);
  assert.match(settingsMarkup, /修改密码/);
  assert.match(settingsMarkup, /切换账号/);
  assert.equal(USER_CHAT_LOGIN_URL, "/login?app=user&next=/chat-ui");

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
  assert.equal(SPEECH_UNSUPPORTED_MESSAGE, "当前设备暂不支持语音输入，请使用文字输入。");
  assert.equal(getSpeechRecognitionErrorMessage("not-allowed"), SPEECH_PERMISSION_MESSAGE);
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
    attachments: [attachment],
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
  assert.match(String(calls[0].init?.body), /"source":"file"/);

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
  const changePasswordRouteText = readFileSync("app/api/auth/change-password/route.ts", "utf8");

  assert.match(avatarRouteText, /formData\.get\("avatar"\)\s*\?\?\s*formData\.get\("file"\)/);
  assert.match(avatarRouteText, /data:\$\{avatar\.type\};base64/);
  assert.doesNotMatch(avatarRouteText, /knowledge_files|ingestion_jobs|knowledge_chunks|\/api\/admin/);
  assert.doesNotMatch(changePasswordRouteText, /knowledge_files|ingestion_jobs|knowledge_chunks|\/api\/admin/);
  assert.doesNotMatch(readFileSync("prisma/schema.prisma", "utf8"), /avatar_url|avatarUrl/);
  assert.equal(readdirSync("prisma/migrations").some((name) => /avatar|profile/i.test(name)), false);

  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;

  console.log("Chat UI tests passed.");
}

void main();
