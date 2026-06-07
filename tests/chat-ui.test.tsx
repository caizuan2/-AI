import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ChatUiPage from "../app/(user)/chat-ui/page";
import { askChat, fetchQuickActionCategories } from "../app/(user)/chat-ui/api";
import {
  appendAskResult,
  createAskRequestPayload,
  createNewChatState,
  createUserMessage,
  normalizeChatMode
} from "../app/(user)/chat-ui/chat-ui-state";
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

  const settingsMarkup = renderToStaticMarkup(<ChatSettingsMenu open />);

  assert.match(settingsMarkup, /退出登录/);
  assert.match(settingsMarkup, /修改密码/);
  assert.match(settingsMarkup, /切换账号/);

  const attachmentMenuMarkup = renderToStaticMarkup(<AttachmentMenu open />);

  assert.match(attachmentMenuMarkup, /上传手机照片/);
  assert.match(attachmentMenuMarkup, /上传文件/);
  assert.match(attachmentMenuMarkup, /打开相机/);

  for (const routeFile of [
    "app/api/ai/chat/ask/route.ts",
    "app/api/ai/chat/conversations/route.ts",
    "app/api/ai/chat/history/route.ts"
  ]) {
    assert.match(readFileSync(routeFile, "utf8"), /requireLicense:\s*true/);
  }

  const userCategoriesRoute = readFileSync("app/api/user/categories/route.ts", "utf8");

  assert.match(userCategoriesRoute, /requireLicensedUser/);
  assert.match(userCategoriesRoute, /export async function GET/);
  assert.doesNotMatch(userCategoriesRoute, /export async function (POST|PATCH|DELETE)/);

  const modeMarkup = renderToStaticMarkup(
    <ModeToggle mode="fast" onChange={() => undefined} />
  );

  assert.match(modeMarkup, /快速模式/);
  assert.match(modeMarkup, /专家模式/);
  assert.equal(normalizeChatMode("expert"), "expert");
  assert.equal(normalizeChatMode("unknown"), "fast");

  const payload = createAskRequestPayload({
    text: "  退款流程怎么处理？ ",
    attachments: [],
    conversation_id: "conv_1",
    mode: "expert",
    enable_deep_thinking: true,
    enable_web_search: true
  });

  assert.equal(payload.question, "退款流程怎么处理？");
  assert.equal(payload.mode, "expert");
  assert.equal(payload.enable_deep_thinking, true);
  assert.equal(payload.enable_web_search, true);

  const localUserMessage = createUserMessage("退款流程怎么处理？");
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
    attachments: [],
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

  const categoryCalls: Array<RequestInfo | URL> = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    categoryCalls.push(input);

    return new Response(JSON.stringify({
    ok: true,
    success: true,
    data: {
      categories: [
        {
          name: "管理员分类",
          count: 3
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

  assert.equal(quickCategories[0].label, "管理员分类");
  assert.equal(quickCategories[0].kind, "category");
  assert.equal(String(categoryCalls[0]), "/api/user/categories");

  let fallbackCallCount = 0;

  globalThis.fetch = (async () => {
    fallbackCallCount += 1;

    if (fallbackCallCount === 1) {
      return new Response(JSON.stringify({
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
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      success: true,
      data: {
        categories: [
          {
            name: "旧接口分类",
            count: 2
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

  const fallbackCategories = await fetchQuickActionCategories();

  assert.equal(fallbackCategories[0].label, "旧接口分类");
  assert.equal(fallbackCallCount, 2);

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

  console.log("Chat UI tests passed.");
}

void main();
