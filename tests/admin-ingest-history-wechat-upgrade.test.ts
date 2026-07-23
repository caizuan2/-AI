import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  sanitizeAdminIngestPublicMessages
} from "../lib/enterprise/admin-ingest-public-conversation-data";
import {
  buildAdminIngestWechatReplyEvidence,
  buildAdminIngestWechatTranscript,
  calculateAdminIngestWechatSegments,
  parseAdminIngestWechatRoleTranscript
} from "../lib/enterprise/ingest-wechat-transcript";

async function main() {
  const segments = calculateAdminIngestWechatSegments(11_632);
  const lastSegment = segments.at(-1);

  assert.equal(segments.length, 6);
  assert.equal(segments[0].top, 0);
  assert.ok(lastSegment);
  assert.equal(lastSegment.top + lastSegment.height, 11_632);
  assert.ok(segments.slice(1).every((segment, index) => (
    segment.top < segments[index].top + segments[index].height
  )));

  const transcript = buildAdminIngestWechatTranscript([
    {
      text: "客户最早的问题",
      confidence: 92,
      x0: 60,
      x1: 300,
      y0: 100,
      y1: 150,
      imageWidth: 880
    },
    {
      text: "客户最早的问题",
      confidence: 88,
      x0: 60,
      x1: 300,
      y0: 130,
      y1: 180,
      imageWidth: 880
    },
    {
      text: "我已经这样回复过",
      confidence: 91,
      x0: 560,
      x1: 820,
      y0: 300,
      y1: 350,
      imageWidth: 880
    },
    {
      text: "这个方案能解决我的问题吗",
      confidence: 95,
      x0: 50,
      x1: 350,
      y0: 500,
      y1: 550,
      imageWidth: 880
    },
    {
      text: "云南的",
      confidence: 90,
      x0: 620,
      x1: 820,
      y0: 700,
      y1: 750,
      imageWidth: 880
    },
    {
      text: "14:37",
      confidence: 99,
      x0: 400,
      x1: 480,
      y0: 800,
      y1: 830,
      imageWidth: 880
    }
  ]);

  assert.equal(transcript.messages.length, 4);
  assert.equal(transcript.latestCustomerMessage, "这个方案能解决我的问题吗");
  assert.match(transcript.transcript, /客户\(左侧\)：这个方案能解决我的问题吗/);
  assert.match(transcript.transcript, /我\(右侧\)：云南的/);
  assert.equal(transcript.transcript.match(/客户最早的问题/g)?.length, 1);

  const parsedRoleTranscript = parseAdminIngestWechatRoleTranscript([
    "客户(左侧)：我觉得价格有点高",
    "我(右侧)：我可以给您说明价值",
    "客户(左侧)：那售后怎么处理？",
    "我(右侧)：我先给您查一下",
    "[第 3/6 段未识别]"
  ].join("\n"));

  assert.equal(parsedRoleTranscript.latestCustomerMessage, "那售后怎么处理？");
  const evidence = buildAdminIngestWechatReplyEvidence({
    transcript: parsedRoleTranscript.transcript,
    latestCustomerMessage: parsedRoleTranscript.latestCustomerMessage
  });

  assert.match(evidence, /右侧消息只作为已经说过的话和对话背景/);
  assert.match(evidence, /只输出一段可直接发给客户的答案正文/);
  assert.match(evidence, /不要输出识别稿、客户问题分析、回复思路/);

  const sanitized = sanitizeAdminIngestPublicMessages([
    {
      id: "system-secret",
      role: "system",
      content: "不可公开的系统提示词"
    },
    {
      id: "user-1",
      role: "user",
      content: "用户可见原文",
      attachments: [{ privateUrl: "https://private.invalid/file" }]
    },
    {
      id: "assistant-1",
      role: "assistant",
      content: "# DeepSeek/豆包原文\n\n不做过滤与加层",
      provider: "private-provider",
      metadata: { internal: true }
    }
  ]);

  assert.deepEqual(sanitized, [
    { id: "user-1", role: "user", content: "用户可见原文" },
    { id: "assistant-1", role: "assistant", content: "# DeepSeek/豆包原文\n\n不做过滤与加层" }
  ]);

  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "admin-ingest-public-links-"));
  process.env.ADMIN_INGEST_PUBLIC_CONVERSATION_DIR = temporaryRoot;

  try {
    const {
      appendAdminIngestPublicGroupMessage,
      createOrUpdateAdminIngestPublicConversation,
      getActiveAdminIngestPublicConversation,
      revokeAdminIngestPublicConversation
    } = await import("../lib/enterprise/admin-ingest-public-conversation-store");
    const share = await createOrUpdateAdminIngestPublicConversation({
      ownerUserId: "admin-1",
      conversationId: "conversation-1",
      kind: "share",
      title: "安全分享",
      messages: sanitized
    });
    const activeShare = await getActiveAdminIngestPublicConversation(share.token);

    assert.equal(activeShare?.messages.length, 2);
    assert.equal(activeShare?.messages[1].content, "# DeepSeek/豆包原文\n\n不做过滤与加层");
    await assert.rejects(
      () => appendAdminIngestPublicGroupMessage(share.token, {
        nickname: "访客",
        content: "不能向分享链接发群聊消息"
      }),
      /群聊不存在或已关闭/
    );

    const group = await createOrUpdateAdminIngestPublicConversation({
      ownerUserId: "admin-1",
      conversationId: "conversation-1",
      kind: "group",
      title: "安全群聊",
      messages: sanitized
    });
    const updatedGroup = await appendAdminIngestPublicGroupMessage(group.token, {
      nickname: "访客 A",
      content: "这是一条真实群聊消息"
    });

    assert.equal(updatedGroup.groupMessages.length, 1);
    assert.equal(updatedGroup.groupMessages[0].nickname, "访客 A");

    await revokeAdminIngestPublicConversation({
      ownerUserId: "admin-1",
      conversationId: "conversation-1",
      token: share.token
    });
    assert.equal(await getActiveAdminIngestPublicConversation(share.token), null);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }

  const shellSource = await readFile("components/enterprise-admin/IngestChatGPTShell.tsx", "utf8");
  const moreActionsSource = shellSource.slice(
    shellSource.indexOf("const moreToolActions"),
    shellSource.indexOf("const EMPTY_AGENTS")
  );
  const conversationMenuSource = await readFile(
    "components/enterprise-admin/IngestConversationActionMenu.tsx",
    "utf8"
  );
  const modeToggleSource = await readFile("components/enterprise-admin/IngestModeToggle.tsx", "utf8");

  assert.match(moreActionsSource, /文件上传/);
  assert.match(moreActionsSource, /图片识别·支持微信长截图/);
  assert.match(moreActionsSource, /网址投喂/);
  assert.doesNotMatch(moreActionsSource, /分类标签|连接状态/);
  assert.match(conversationMenuSource, /分享/);
  assert.match(conversationMenuSource, /开始群聊/);
  assert.match(conversationMenuSource, /取消置顶/);
  assert.match(conversationMenuSource, /取消归档/);
  assert.match(modeToggleSource, /metadataState !== "unavailable" && !isWechatConversationReply/);
  assert.match(modeToggleSource, /只输出可直接发送给客户的答案正文/);

  console.log("Admin ingest history and WeChat upgrade tests passed.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
