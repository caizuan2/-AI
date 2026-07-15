import assert from "node:assert/strict";
import { handleAiChatAsk, type AiChatDb } from "../lib/ai-chat/ask";

type AnyRecord = Record<string, unknown>;

function createFakeDb(): {
  db: AiChatDb;
  state: {
    conversations: AnyRecord[];
    messages: AnyRecord[];
    chunks: AnyRecord[];
    auditLogs: AnyRecord[];
  };
} {
  const state = {
    conversations: [] as AnyRecord[],
    messages: [] as AnyRecord[],
    chunks: [] as AnyRecord[],
    auditLogs: [] as AnyRecord[]
  };

  function now() {
    return new Date("2026-06-06T12:00:00.000Z");
  }

  const db = {
    knowledgeChunk: {
      findMany: async () => state.chunks as never
    },
    conversation: {
      findFirst: async () => null,
      findMany: async () => [],
      create: async ({ data }: { data: AnyRecord }) => {
        const conversation = {
          id: `conv_${state.conversations.length + 1}`,
          ...data,
          createdAt: now(),
          updatedAt: now()
        };

        state.conversations.push(conversation);
        return conversation;
      },
      update: async ({ where, data }: { where: { id: string }; data: AnyRecord }) => {
        const conversation = state.conversations.find((item) => item.id === where.id);

        assert.ok(conversation);
        Object.assign(conversation, data, { updatedAt: now() });
        return conversation;
      }
    },
    message: {
      create: async ({ data }: { data: AnyRecord }) => {
        const message = {
          id: `msg_${state.messages.length + 1}`,
          ...data,
          createdAt: now()
        };

        state.messages.push(message);
        return message;
      }
    },
    auditLog: {
      create: async ({ data }: { data: AnyRecord }) => {
        const log = {
          id: `audit_${state.auditLogs.length + 1}`,
          ...data,
          createdAt: now()
        };

        state.auditLogs.push(log);
        return log;
      }
    }
  } satisfies AiChatDb;

  return { db, state };
}

async function main() {
  const fake = createFakeDb();

  fake.state.chunks.push({
    id: "chunk_refund_1",
    fileId: "file_refund",
    knowledgeItemId: "knowledge_refund",
    metadata: {
      agentId: "chief",
      knowledgeBaseId: "kb:chief",
      namespace: "agent:chief:kb:kb:chief",
      published: true,
      sharedToUserApp: true
    },
    chunkText: "客户申请退款时，需要先核对订单号、付款时间和售后原因，再由负责人确认退款范围。",
    summary: "退款流程",
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    knowledgeItem: {
      id: "knowledge_refund",
      userId: "user_1",
      title: "退款处理流程",
      summary: "退款处理流程",
      tags: ["退款", "售后"],
      category: "售后",
      sourceType: "admin_text",
      sourceTitle: "退款处理流程",
      sourceUrl: null,
      importance: 3,
      deletedAt: null
    },
    file: {
      id: "file_refund",
      originalName: "refund.md",
      deletedAt: null
    }
  });

  const result = await handleAiChatAsk({
    id: "user_1",
    role: "user"
  }, {
    question: "这张微信截图里的客户怎么回复？",
    mode: "expert",
    attachments: [
      {
        type: "image",
        name: "wechat.png",
        filename: "wechat.png",
        mime_type: "image/png",
        metadata: {
          ocrStatus: "ok",
          ocrText: "客户在微信截图里说：我想申请退款，订单号要在哪里找？"
        }
      }
    ]
  }, {
    db: fake.db,
    providerConfigured: true,
    answerProvider: async ({ businessExecutionContext, contexts }) => {
      assert.match(businessExecutionContext ?? "", /USER_IMAGE_OCR_CONTEXT/);
      assert.match(businessExecutionContext ?? "", /WECHAT_SCREENSHOT_PRIMARY_CONTEXT/);
      assert.match(businessExecutionContext ?? "", /禁止编造截图里没有出现/);
      assert.match(businessExecutionContext ?? "", /我想申请退款/);
      assert.equal(contexts.some((context) => context.sourceId === "chunk_refund_1"), true);
      assert.equal(contexts.some((context) => context.sourceType === "attachment_ocr"), true);

      return {
        answer: "先安抚客户，再引导客户提供订单号并说明退款处理流程。",
        providerUsed: "test",
        modelUsed: "test-model",
        fallbackUsed: false
      };
    }
  });

  assert.equal(result.provider_status, "ok");
  assert.equal(result.sources.some((source) => source.chunk_id === "chunk_refund_1"), true);
  assert.equal(
    fake.state.messages.some((message) => (
      message.role === "USER" &&
      (message.metadata as AnyRecord | undefined)?.attachmentOcrApplied === true
    )),
    true
  );

  const ocrOnlyFake = createFakeDb();
  const ocrOnlyResult = await handleAiChatAsk({
    id: "user_1",
    role: "user"
  }, {
    question: "这张微信截图里的客户怎么回复？",
    mode: "expert",
    attachments: [
      {
        type: "image",
        name: "wechat-only.png",
        filename: "wechat-only.png",
        mime_type: "image/png",
        metadata: {
          ocrStatus: "ok",
          ocrText: "客户说：我现在不想继续沟通了，先不用联系我。"
        }
      }
    ]
  }, {
    db: ocrOnlyFake.db,
    providerConfigured: true,
    answerProvider: async ({ businessExecutionContext, contexts }) => {
      assert.match(businessExecutionContext ?? "", /我现在不想继续沟通/);
      assert.equal(contexts.some((context) => context.sourceType === "attachment_ocr"), true);

      return {
        answer: "可以先尊重客户边界，简短表达理解，再留一个低压力的后续入口。",
        providerUsed: "test",
        modelUsed: "test-model",
        fallbackUsed: false
      };
    }
  });

  assert.equal(ocrOnlyResult.provider_status, "ok");
  assert.equal(ocrOnlyResult.sources.length, 0);

  const wechatScreenshotFake = createFakeDb();
  wechatScreenshotFake.state.chunks.push({
    id: "chunk_kks_1",
    fileId: "file_kks",
    knowledgeItemId: "knowledge_kks",
    metadata: {
      agentId: "kks",
      knowledgeBaseId: "kb:kks",
      namespace: "agent:kks:kb:kb:kks",
      published: true,
      sharedToUserApp: true
    },
    chunkText: "客户担心减肥产品反弹、拉肚子、副作用和多久见效时，需要先承接顾虑，再解释体重管理逻辑。不要编造客户没有说过的症状。",
    summary: "体重管理顾虑承接",
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    knowledgeItem: {
      id: "knowledge_kks",
      userId: "user_1",
      title: "体重管理顾虑承接",
      summary: "体重管理顾虑承接",
      tags: ["瘦身", "顾虑"],
      category: "瘦身",
      sourceType: "admin_text",
      sourceTitle: "体重管理顾虑承接",
      sourceUrl: null,
      importance: 3,
      deletedAt: null
    },
    file: {
      id: "file_kks",
      originalName: "kks.md",
      deletedAt: null
    }
  });
  const wechatScreenshotOcrText = [
    "我看到你朋友圈在卖那个减肥产品，我想了解一下",
    "我生完宝宝之后，体重一直下不去",
    "我之前也吃过一些其它抑制我食欲的产品，但是那个太伤身体了",
    "你们这个是什么原理瘦身",
    "会反弹吗",
    "会拉肚子吗",
    "有副作用吗",
    "多久能看到效果呢"
  ].join("\n");
  const wechatScreenshotResult = await handleAiChatAsk({
    id: "user_1",
    role: "user"
  }, {
    question: "看图问题，怎么引导呢",
    mode: "expert",
    attachments: [
      {
        type: "image",
        name: "wechat-customer.png",
        filename: "wechat-customer.png",
        mime_type: "image/png",
        metadata: {
          ocrStatus: "ok",
          ocrText: wechatScreenshotOcrText
        }
      }
    ]
  }, {
    db: wechatScreenshotFake.db,
    providerConfigured: true,
    answerProvider: async ({ businessExecutionContext, contexts }) => {
      const context = businessExecutionContext ?? "";

      assert.match(context, /WECHAT_SCREENSHOT_PRIMARY_CONTEXT/);
      assert.match(context, /生完宝宝/);
      assert.match(context, /抑制我食欲/);
      assert.match(context, /什么原理瘦身/);
      assert.match(context, /会反弹/);
      assert.match(context, /会拉肚子/);
      assert.match(context, /有副作用/);
      assert.match(context, /多久能看到效果/);
      assert.match(context, /不要泛化讲看图方法/);
      assert.match(context, /禁止编造截图里没有出现/);
      assert.equal(contexts.some((item) => item.sourceType === "attachment_ocr"), true);

      return {
        answer: "先提炼客户顾虑：产后体重、担心伤身体、原理、反弹、拉肚子、副作用和见效时间。再围绕这些原话给引导策略和可复制话术。",
        providerUsed: "test",
        modelUsed: "test-model",
        fallbackUsed: false
      };
    }
  });

  assert.equal(wechatScreenshotResult.provider_status, "ok");
  assert.match(wechatScreenshotResult.answer, /产后体重/);

  const wechatRoleFake = createFakeDb();
  const wechatRoleOcrText = [
    "我(右侧)：那你们都是怎么出售的呀，有销售团队吗",
    "客户(左侧)：主要是代工生产，自主产品主要是对接的是经销商",
    "客户(左侧)：基本上不怎么零售",
    "我(右侧)：批发吗",
    "客户(左侧)：对，主要是批发",
    "我(右侧)：您是业务经理",
    "客户(左侧)：是的",
    "我(右侧)：厉害那你有很大的团队啦",
    "客户(左侧)：是的",
    "我(右侧)：您这个经理可不是一般人呢",
    "我(右侧)：又帅又年轻前途无量呀",
    "客户(左侧)：过奖了，您这边主要是做什么的"
  ].join("\n");
  const wechatRoleResult = await handleAiChatAsk({
    id: "user_1",
    role: "user"
  }, {
    question: "帮我看看这个该怎么回，给我具体思路和话术",
    mode: "expert",
    attachments: [
      {
        type: "image",
        name: "wechat-role.png",
        filename: "wechat-role.png",
        mime_type: "image/png",
        metadata: {
          ocrStatus: "ok",
          ocrText: wechatRoleOcrText
        }
      }
    ]
  }, {
    db: wechatRoleFake.db,
    providerConfigured: true,
    answerProvider: async ({ businessExecutionContext, contexts }) => {
      const context = businessExecutionContext ?? "";

      assert.match(context, /\[WECHAT_SCREENSHOT_ROLE_RULES\]/);
      assert.match(context, /左侧头像\/白色气泡\/标注为客户\(左侧\)的是客户/);
      assert.match(context, /右侧头像\/绿色气泡\/标注为我\(右侧\)的是用户本人/);
      assert.match(context, /角色绝对不能反/);
      assert.match(context, /不要把右侧绿色气泡当成客户说的话/);
      assert.match(context, /回答目标必须是客户最后一条左侧\/客户\(左侧\)消息/);
      assert.match(context, /客户\(左侧\)：过奖了，您这边主要是做什么的/);
      assert.equal(contexts.some((item) => item.sourceType === "attachment_ocr"), true);

      return {
        answer: "客户最后问的是“您这边主要是做什么的”。建议别急着讲产品，先用一句轻松自然的自我介绍接住，再反问对方业务方向，继续建立连接。",
        providerUsed: "test",
        modelUsed: "test-model",
        fallbackUsed: false
      };
    }
  });

  assert.equal(wechatRoleResult.provider_status, "ok");
  assert.match(wechatRoleResult.answer, /客户最后问的是/);
  assert.match(wechatRoleResult.answer, /您这边主要是做什么的/);

  const careerOcrOnlyFake = createFakeDb();
  let careerOcrOnlyProviderCalled = false;
  const careerOcrOnlyResult = await handleAiChatAsk({
    id: "user_1",
    role: "user"
  }, {
    question: "客户说贵怎么回复？",
    mode: "expert",
    agentId: "expert-career",
    knowledgeBaseId: "kb-business-coach",
    namespace: "kb-business-coach",
    attachments: [{
      type: "image",
      name: "career-objection.png",
      filename: "career-objection.png",
      mime_type: "image/png",
      metadata: {
        ocrStatus: "ok",
        ocrText: "客户(左侧)：我觉得有点贵，想再考虑一下。"
      }
    }]
  }, {
    db: careerOcrOnlyFake.db,
    providerConfigured: true,
    answerProvider: async () => {
      careerOcrOnlyProviderCalled = true;
      return {
        answer: "没有知识证据时不应该调用模型。",
        providerUsed: "test",
        modelUsed: "test-model",
        fallbackUsed: false
      };
    }
  });

  assert.equal(careerOcrOnlyProviderCalled, false);
  assert.equal(careerOcrOnlyResult.provider_status, "no_relevant_knowledge");
  assert.match(careerOcrOnlyResult.answer, /本轮暂未形成可验证的同阶段知识证据链/);
  assert.doesNotMatch(careerOcrOnlyResult.answer, /### AI思考回复话术|### 话术 1/);
  assert.equal(careerOcrOnlyResult.customer_answer, "");

  const missingOcrFake = createFakeDb();
  let missingOcrProviderCalled = false;
  const missingOcrResult = await handleAiChatAsk({
    id: "user_1",
    role: "user"
  }, {
    question: "看图问题，怎么引导呢",
    mode: "expert",
    attachments: [
      {
        type: "image",
        name: "unclear-wechat.png",
        filename: "unclear-wechat.png",
        mime_type: "image/png",
        metadata: {
          ocrStatus: "unavailable"
        }
      }
    ]
  }, {
    db: missingOcrFake.db,
    providerConfigured: true,
    answerProvider: async () => {
      missingOcrProviderCalled = true;

      return {
        answer: "不应该调用模型。",
        providerUsed: "test",
        modelUsed: "test-model",
        fallbackUsed: false
      };
    }
  });

  assert.equal(missingOcrProviderCalled, false);
  assert.equal(missingOcrResult.provider_status, "no_relevant_knowledge");
  assert.match(missingOcrResult.answer, /截图的文字没有识别成功/);

  console.log("AI chat attachment OCR context tests passed.");
}

void main();
