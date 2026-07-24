import {
  parseAdminIngestWechatRoleTranscript
} from "@/lib/enterprise/ingest-wechat-transcript";
import {
  normalizeAdminIngestWechatOutputMode,
  type AdminIngestWechatOutputMode
} from "@/lib/enterprise/admin-ingest-wechat-output-mode";

type AdminIngestWechatGroundingAttachment = {
  extractedText?: string;
  pageSummaries?: string[];
  wechatOutputMode?: AdminIngestWechatOutputMode;
};

const WECHAT_EVIDENCE_MARKER = "【微信对话截图识别稿】";
const MAX_WECHAT_GROUNDING_QUERY_CHARS = 2_000;
const MAX_WECHAT_GROUNDING_CONTEXT_MESSAGES = 8;

function clean(value: unknown) {
  return typeof value === "string"
    ? value
      .replace(/\u0000/g, "")
      .replace(/\r\n?/g, "\n")
      .trim()
    : "";
}

function readLatestCustomerSummary(attachments: AdminIngestWechatGroundingAttachment[]) {
  for (const attachment of attachments) {
    for (const summary of attachment.pageSummaries ?? []) {
      const match = clean(summary).match(/^最近客户消息\s*[：:]\s*(.+)$/);

      if (match?.[1]) {
        return match[1].trim();
      }
    }
  }

  return "";
}

function normalizeComparableText(value: string) {
  return value
    .replace(/\[截断\]/g, "")
    .replace(/\s+/g, "")
    .replace(/[，,。；;！？!?：:'"“”‘’（）()【】\[\]…·~～—-]/g, "")
    .toLowerCase();
}

function buildConversationContext(
  transcript: ReturnType<typeof parseAdminIngestWechatRoleTranscript>,
  latestCustomerMessage: string
) {
  const normalizedLatestCustomer = normalizeComparableText(latestCustomerMessage);
  const matchedCustomerIndex = transcript.messages
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => (
      message.role === "customer"
      && normalizeComparableText(message.text) === normalizedLatestCustomer
    ))
    .at(-1)?.index ?? -1;
  const latestCustomerIndex = matchedCustomerIndex >= 0
    ? matchedCustomerIndex
    : transcript.messages
      .map((message, index) => ({ message, index }))
      .filter(({ message }) => message.role === "customer")
      .at(-1)?.index ?? -1;

  if (latestCustomerIndex < 0) {
    return [];
  }

  return transcript.messages
    .slice(
      Math.max(0, latestCustomerIndex - MAX_WECHAT_GROUNDING_CONTEXT_MESSAGES + 1),
      latestCustomerIndex + 1
    )
    .map((message) => (
      `${message.role === "customer" ? "客户" : "用户已说"}：${message.text}`
    ));
}

function buildWechatReplyTask(
  latestCustomerMessage: string,
  outputMode: AdminIngestWechatOutputMode
) {
  const replyTarget = latestCustomerMessage || "截图中可靠识别到的最后一条左侧客户消息";
  const sharedRules = [
    "请处理已完成角色识别的微信对话截图。",
    `唯一回复目标：左侧客户的最近消息“${replyTarget}”。`,
    "截图中位于该目标之后的右侧绿色消息，是用户本人已经说过的话，只能用于避免重复，不能成为回答对象，也不能继续其中的话题。",
    "专业内容必须严格依据当前 Agent 已命中的固定知识库；不得跨专家、跨知识库或用通用知识补写。"
  ];

  if (outputMode === "full_answer") {
    return [
      ...sharedRules,
      "请直接输出完整 Markdown 正文，并严格包含以下四个二级标题：",
      "## 核心判断",
      "判断客户当前阶段、真实顾虑和本轮沟通重点。",
      "## 当下可直接发的回复",
      "给出一段可以直接复制发给客户的话术。",
      "## 接下来的推进节奏",
      "说明后续怎么聊、问什么以及合适的推进时机。",
      "## 这几个坑千万别踩",
      "说明不应说什么、不应急着做什么以及需要注意的风险。",
      "不要输出 OCR 原文、识别说明、知识来源、角色标签、模型信息或内部推理过程。"
    ].join("\n");
  }

  return [
    ...sharedRules,
    "只输出一段可直接复制发给客户的正文，不要输出标题、分析、识别说明、知识来源、角色标签或内部判断过程。"
  ].join("\n");
}

export function buildAdminIngestWechatGroundingRequest(input: {
  input: string;
  attachments: AdminIngestWechatGroundingAttachment[];
}) {
  const regularQuery = clean(input.input);
  const evidenceAttachments = input.attachments.filter((attachment) => (
    clean(attachment.extractedText).includes(WECHAT_EVIDENCE_MARKER)
  ));

  if (evidenceAttachments.length === 0) {
    return {
      isWechatConversation: false as const,
      strictKnowledgeMode: false as const,
      query: regularQuery,
      modelInput: regularQuery,
      latestCustomerMessage: null
    };
  }

  const evidence = evidenceAttachments
    .map((attachment) => clean(attachment.extractedText))
    .filter(Boolean)
    .join("\n");
  const transcript = parseAdminIngestWechatRoleTranscript(evidence);
  const latestCustomerMessage = transcript.latestCustomerMessage
    || readLatestCustomerSummary(evidenceAttachments);
  const outputMode = normalizeAdminIngestWechatOutputMode(
    evidenceAttachments.find((attachment) => attachment.wechatOutputMode)?.wechatOutputMode
  );
  const conversationContext = buildConversationContext(transcript, latestCustomerMessage);
  const query = [
    latestCustomerMessage
      ? `客户最近消息：${latestCustomerMessage}`
      : "客户最近消息：未能可靠确定",
    conversationContext.length > 0 ? "截止客户最近消息的对话上下文：" : "",
    ...conversationContext
  ].filter(Boolean).join("\n").slice(0, MAX_WECHAT_GROUNDING_QUERY_CHARS);

  return {
    isWechatConversation: true as const,
    strictKnowledgeMode: true as const,
    query,
    modelInput: buildWechatReplyTask(latestCustomerMessage, outputMode),
    latestCustomerMessage: latestCustomerMessage || null,
    outputMode
  };
}
