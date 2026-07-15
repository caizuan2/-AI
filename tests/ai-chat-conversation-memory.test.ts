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

  const db = {
    knowledgeChunk: {
      findMany: async () => state.chunks as never
    },
    conversation: {
      findFirst: async ({ where }: { where: AnyRecord }) => {
        return state.conversations.find((item) => (
          item.id === where.id &&
          item.userId === where.userId &&
          item.type === where.type
        )) ?? null;
      },
      findMany: async () => [],
      create: async ({ data }: { data: AnyRecord }) => {
        const conversation = {
          id: `conv_${state.conversations.length + 1}`,
          ...data,
          createdAt: new Date("2026-06-06T12:00:00.000Z"),
          updatedAt: new Date("2026-06-06T12:00:00.000Z")
        };

        state.conversations.push(conversation);
        return conversation;
      },
      update: async ({ where, data }: { where: { id: string }; data: AnyRecord }) => {
        const conversation = state.conversations.find((item) => item.id === where.id);

        assert.ok(conversation);
        Object.assign(conversation, data, { updatedAt: new Date("2026-06-06T12:05:00.000Z") });
        return conversation;
      }
    },
    message: {
      findMany: async ({ where, take }: { where: AnyRecord; take?: number }) => {
        const allowedUserIds = Array.isArray(where.OR)
          ? new Set(where.OR.map((item) => (item as AnyRecord).userId))
          : null;

        return state.messages
          .filter((message) => message.conversationId === where.conversationId)
          .filter((message) => !allowedUserIds || allowedUserIds.has(message.userId))
          .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
          .slice(0, typeof take === "number" ? take : undefined) as never;
      },
      create: async ({ data }: { data: AnyRecord }) => {
        const message = {
          id: `msg_${state.messages.length + 1}`,
          ...data,
          createdAt: new Date(`2026-06-06T12:${String(state.messages.length + 1).padStart(2, "0")}:00.000Z`)
        };

        state.messages.push(message);
        return message;
      }
    },
    auditLog: {
      create: async ({ data }: { data: AnyRecord }) => {
        state.auditLogs.push(data);
        return data;
      }
    }
  } satisfies AiChatDb;

  return { db, state };
}

async function main() {
  const fake = createFakeDb();

  fake.state.conversations.push(
    {
      id: "conv_current",
      userId: "user_1",
      title: "当前会话",
      type: "CHAT",
      mode: "expert",
      createdAt: new Date("2026-06-06T11:00:00.000Z"),
      updatedAt: new Date("2026-06-06T11:03:00.000Z")
    },
    {
      id: "conv_other",
      userId: "user_1",
      title: "其他会话",
      type: "CHAT",
      mode: "expert",
      createdAt: new Date("2026-06-06T10:00:00.000Z"),
      updatedAt: new Date("2026-06-06T10:01:00.000Z")
    }
  );
  fake.state.messages.push(
    {
      id: "msg_prev_user",
      conversationId: "conv_current",
      userId: "user_1",
      role: "USER",
      content: "客户从加上一直接给我群发广告，该怎么回复？",
      createdAt: new Date("2026-06-06T11:01:00.000Z")
    },
    {
      id: "msg_prev_assistant",
      conversationId: "conv_current",
      userId: "user_1",
      role: "ASSISTANT",
      content: "上一版回答：先接住客户情绪，再用问题引导客户说清楚真实情况。",
      metadata: {
        rawAnswerBeforeFinalizer: "上一版完整回答：先接住客户情绪，再用问题引导客户说清楚真实情况。"
      },
      createdAt: new Date("2026-06-06T11:02:00.000Z")
    },
    {
      id: "msg_other_user",
      conversationId: "conv_other",
      userId: "user_1",
      role: "USER",
      content: "其他窗口内容不应该出现",
      createdAt: new Date("2026-06-06T10:01:00.000Z")
    }
  );
  fake.state.chunks.push({
    id: "chunk_sales_1",
    fileId: "file_sales",
    knowledgeItemId: "knowledge_sales",
    chunkText: "上面的客户沟通问题如果需要换一个风格输出，要参考上一轮客户从加上一直接给我群发广告的上下文，先共情，再追问具体背景，最后给下一步建议。",
    summary: "上面问题换风格输出的客户沟通流程",
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    knowledgeItem: {
      id: "knowledge_sales",
      userId: "user_1",
      title: "上面问题换风格输出客户沟通流程",
      summary: "上面问题换风格输出客户沟通流程",
      tags: ["客户沟通", "换风格"],
      category: "沟通",
      sourceType: "admin_text",
      sourceTitle: "客户沟通流程",
      sourceUrl: null,
      importance: 3,
      status: "active",
      deletedAt: null
    }
  });

  const result = await handleAiChatAsk({
    id: "user_1",
    role: "user"
  }, {
    question: "上面的这个问题，再换一个风格输出",
    mode: "expert",
    conversation_id: "conv_current"
  }, {
    db: fake.db,
    providerConfigured: true,
    answerProvider: async ({ recentConversation }) => {
      const memoryText = recentConversation.map((turn) => turn.content).join("\n");

      assert.match(memoryText, /客户从加上一直接给我群发广告/);
      assert.match(memoryText, /上一版回答/);
      assert.equal(memoryText.includes("其他窗口内容不应该出现"), false);

      return {
        answer: "## 换一种风格\n可以更自然地先接住对方，再轻轻追问具体情况。",
        providerUsed: "test",
        modelUsed: "test-model",
        fallbackUsed: false
      };
    }
  });

  assert.equal(result.provider_status, "ok");
  assert.match(result.answer, /^## 换一种风格/);

  const newConversationResult = await handleAiChatAsk({
    id: "user_1",
    role: "user"
  }, {
    question: "上面的这个问题，再换一个风格输出",
    mode: "expert"
  }, {
    db: fake.db,
    providerConfigured: true,
    answerProvider: async ({ recentConversation }) => {
      assert.equal(recentConversation.length, 0);

      return {
        answer: "新会话没有历史上下文。",
        providerUsed: "test",
        modelUsed: "test-model",
        fallbackUsed: false
      };
    }
  });

  assert.equal(newConversationResult.provider_status, "ok");
  assert.equal(newConversationResult.answer, "新会话没有历史上下文。");

  const careerFake = createFakeDb();
  const canonicalIceBreakingScript = "姐/哥，我们这个事业很简单—— 很多80后、90后、00后，甚至50多岁的伙伴，各行各业的人都有。打工的、做生意的、在家带孩子的、退休的——各行各业都有。 他们来到这里之后，短短几个月就做到了周薪五位数。当然收益还有更高的。因为我们的运营方法和流程非常简单，人人都能快速学会。 操作也很方便——一部手机走到哪里做到哪里。不用出去跑、不用看人脸色、不用大量资金。你自己决定自己的节奏。 我这边刚好有两个内部的视频资料——你可以先看看，看完你心里就清楚了。";
  const careerChunkMetadata = {
    agentId: "expert-career",
    knowledgeBaseId: "kb:expert-agent-expert-career",
    namespace: "kb:expert-agent-expert-career",
    sourceApp: "ingest_admin",
    visibility: "published",
    published: true,
    sharedToUserApp: true
  };

  careerFake.state.conversations.push({
    id: "conv_career",
    userId: "user_1",
    title: "讲事业导师续答",
    type: "CHAT",
    mode: "expert",
    createdAt: new Date("2026-06-06T13:00:00.000Z"),
    updatedAt: new Date("2026-06-06T13:03:00.000Z")
  });
  careerFake.state.messages.push(
    {
      id: "msg_career_user",
      conversationId: "conv_career",
      userId: "user_1",
      role: "USER",
      content: "客户是宝妈，应该怎么破冰，给我一些建议",
      createdAt: new Date("2026-06-06T13:01:00.000Z")
    },
    {
      id: "msg_career_assistant",
      conversationId: "conv_career",
      userId: "user_1",
      role: "ASSISTANT",
      content: "上一版错误地推进到了第三步讲事业，这段助手正文不能作为客户阶段依据。",
      createdAt: new Date("2026-06-06T13:02:00.000Z")
    }
  );
  careerFake.state.chunks.push(
    {
      id: "chunk_career_ice",
      fileId: "file_career_ice",
      knowledgeItemId: "knowledge_career_ice",
      chunkText: `01_第一步_破冰。客户可复制话术卡片。话术全文：${canonicalIceBreakingScript}`,
      summary: "宝妈客户第一步破冰、建立信任与发送资料的固定话术",
      metadata: careerChunkMetadata,
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      knowledgeItem: {
        id: "knowledge_career_ice",
        userId: "user_1",
        title: "01_破冰_客户可复制话术卡片_WPS排版版",
        summary: "第一步破冰客户可复制话术",
        tags: ["第一步", "破冰", "宝妈", "客户可复制话术卡片"],
        category: "讲事业导师",
        sourceType: "admin_docx",
        sourceTitle: "01_破冰_客户可复制话术卡片_WPS排版版.docx",
        sourceUrl: null,
        importance: 5,
        status: "published",
        deletedAt: null
      }
    },
    {
      id: "chunk_career_presentation",
      fileId: "file_career_presentation",
      knowledgeItemId: "knowledge_career_presentation",
      chunkText: "03_第三步_讲事业。客户可复制话术卡片。宝妈客户主动了解事业时，讲行业、产品与利润空间。",
      summary: "第三步讲事业的高相关宝妈客户话术",
      metadata: careerChunkMetadata,
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      knowledgeItem: {
        id: "knowledge_career_presentation",
        userId: "user_1",
        title: "03_讲事业第三步_客户可复制话术卡片_WPS排版版",
        summary: "第三步讲事业客户可复制话术",
        tags: ["第三步", "讲事业", "宝妈", "客户可复制话术卡片"],
        category: "讲事业导师",
        sourceType: "admin_docx",
        sourceTitle: "03_讲事业第三步_客户可复制话术卡片_WPS排版版.docx",
        sourceUrl: null,
        importance: 5,
        status: "published",
        deletedAt: null
      }
    }
  );

  const careerResult = await handleAiChatAsk({
    id: "user_1",
    role: "user"
  }, {
    question: "再换一个方案",
    mode: "expert",
    conversation_id: "conv_career",
    agentId: "expert-career",
    knowledgeBaseId: "kb:expert-agent-expert-career",
    namespace: "kb:expert-agent-expert-career"
  }, {
    db: careerFake.db,
    providerConfigured: true,
    answerProvider: async ({
      question,
      contexts,
      enableDeepThinking,
      businessExecutionContext,
      recentConversation,
      careerMentorStage
    }) => {
      assert.match(question, /客户是宝妈.*破冰/);
      assert.equal(enableDeepThinking, true);
      assert.equal(careerMentorStage, "ice_breaking");
      assert.deepEqual(recentConversation.map((turn) => turn.role), ["user", "assistant"]);
      assert.match(recentConversation[0].content, /客户是宝妈.*破冰/);
      assert.match(recentConversation[1].content, /第三步讲事业/);
      assert.match(businessExecutionContext ?? "", /本轮内部定位：.*第一步：破冰/);
      assert.match(businessExecutionContext ?? "", /本轮属于同一场景续答/);
      assert.match(businessExecutionContext ?? "", /最近用户原始场景：客户是宝妈/);
      assert.doesNotMatch(businessExecutionContext ?? "", /本轮内部定位：.*第三步：讲事业/);
      assert.equal(contexts.some((context) => context.sourceId === "chunk_career_ice"), true);
      assert.equal(contexts.some((context) => context.sourceId === "chunk_career_presentation"), false);

      return {
        answer: [
          "## 判断",
          "当前阶段：第一步——破冰。调用步骤：第一步破冰。判断依据：客户是宝妈，仍需先建立连接和信任。",
          "",
          "## 回复思路",
          "继续围绕同一位宝妈客户调整表达，不跳到第三步讲事业。",
          "",
          "### AI思考回复话术",
          "",
          "#### AI建议话术 1",
          "",
          "> 您好，我们先不急着聊太多。我想先了解一下，您现在更希望改善时间安排，还是想多了解一个适合自己的选择？",
          "",
          "### 推荐执行流程",
          "",
          "1. 先自然建立连接。",
          "2. 找到真实关注点后再发送资料。",
          "",
          "## 可复制给客户",
          "",
          "### 话术 1",
          "",
          "> 这是模型临时编写、尚未经过知识库逐字核对的话术。"
        ].join("\n"),
        providerUsed: "test",
        modelUsed: "test-model",
        fallbackUsed: false
      };
    }
  });

  assert.equal(careerResult.provider_status, "ok");
  assert.match(careerResult.answer, /## 判断/);
  assert.match(careerResult.answer, /当前阶段：第一步.*破冰/);
  assert.match(careerResult.answer, /## 回复思路/);
  assert.match(careerResult.answer, /### 推荐执行流程/);
  assert.match(careerResult.answer, /### AI思考回复话术/);
  assert.match(careerResult.answer, /## 可复制给客户/);
  assert.match(careerResult.answer, /姐\/哥，我们这个事业很简单/);
  assert.doesNotMatch(careerResult.answer, /本轮没有检索到可逐字核对/);
  assert.doesNotMatch(careerResult.answer, /模型临时编写/);
  assert.doesNotMatch(careerResult.answer, /当前阶段：第三步/);
  assert.equal(careerResult.sources.some((source) => source.chunk_id === "chunk_career_ice"), true);
  assert.equal(careerResult.sources.some((source) => source.chunk_id === "chunk_career_presentation"), false);
  assert.match(careerResult.customer_answer, /^姐\/哥，我们这个事业很简单/);

  const savedCareerFollowUp = careerFake.state.messages.find((message) => (
    message.role === "USER" && message.content === "再换一个方案"
  ));

  assert.ok(savedCareerFollowUp);
  const savedCareerMetadata = savedCareerFollowUp.metadata as AnyRecord;
  const savedCareerPolicy = savedCareerMetadata.careerMentorPolicy as AnyRecord;
  assert.equal(savedCareerPolicy.currentStage, "unknown");
  assert.equal(savedCareerPolicy.resolvedStage, "ice_breaking");
  assert.equal(savedCareerPolicy.continuationRequested, true);
  assert.equal(savedCareerPolicy.conversationContextApplied, true);

  console.log("AI chat conversation memory tests passed.");
}

void main();
