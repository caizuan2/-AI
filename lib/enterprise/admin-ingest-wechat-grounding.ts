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
const WECHAT_CURRENT_TURN_ROLE_INSUFFICIENT_MARKER = "【当前回合角色核验】证据不足";
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

function readLastStructuredRoleMessage(value: string) {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const match = lines[index]?.trim().match(/^(客户|我)\s*[（(](左侧|右侧)[）)]\s*[：:]\s*(.*)$/);

    if (!match) {
      continue;
    }

    const role = match[1] === "客户" && match[2] === "左侧"
      ? "customer" as const
      : match[1] === "我" && match[2] === "右侧"
        ? "user" as const
        : null;
    const text = clean(match[3]);

    if (!role || !text) {
      return null;
    }

    return { role, text };
  }

  return null;
}

function buildConversationContext(
  transcript: ReturnType<typeof parseAdminIngestWechatRoleTranscript>,
  latestCustomerMessage: string,
  targetMessageIndex?: number
) {
  const normalizedLatestCustomer = normalizeComparableText(latestCustomerMessage);
  const matchedCustomerIndex = transcript.messages
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => (
      message.role === "customer"
      && normalizeComparableText(message.text) === normalizedLatestCustomer
    ))
    .at(-1)?.index ?? -1;
  const latestCustomerIndex = targetMessageIndex ?? (matchedCustomerIndex >= 0
    ? matchedCustomerIndex
    : transcript.messages
      .map((message, index) => ({ message, index }))
      .filter(({ message }) => message.role === "customer")
      .at(-1)?.index ?? -1);

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
  outputMode: AdminIngestWechatOutputMode,
  modelProvider?: string | null,
  currentTurn?: {
    waitingForCustomerReply: boolean;
    evidenceInsufficient: boolean;
    latestUserMessage: string;
  }
) {
  if (outputMode === "full_answer" && currentTurn?.evidenceInsufficient) {
    return [
      "请处理已完成角色识别的微信对话截图。",
      "当前回合证据不足：无法可靠确认截图底部最后一条有效消息的角色或完整正文。",
      "不得回退到更早的左侧客户消息生成回复，不得猜测客户已经说了什么，也不得虚构当前沟通阶段。",
      "请直接输出简洁的 Markdown 正文，说明当前无法安全生成本轮客户回复，并建议用户上传更清晰的原始截图或包含底部完整气泡的分段截图。",
      "不要输出 OCR 原文、识别说明、知识来源、角色标签、模型信息或内部推理过程。"
    ].join("\n");
  }

  if (outputMode === "full_answer" && currentTurn?.waitingForCustomerReply) {
    return [
      "请处理已完成角色识别的微信对话截图。",
      `当前回合锚点：截图底部最后一条有效消息来自右侧用户本人“${currentTurn.latestUserMessage}”。`,
      "这表示用户已经完成当前回复，正在等待左侧客户的新回复。不得回到更早的左侧客户消息继续生成本轮回复，也不得假设客户已经作出新的回应。",
      "专业内容必须严格依据当前 Agent 已命中的固定知识库；不得跨专家、跨知识库或用通用知识补写。",
      "请直接输出完整 Markdown 正文，明确当前应等待客户回复，并根据已经识别到的对话给出客户后续可能回应时的分支处理建议、推进动作和注意事项。",
      "截图信息不足时，只能依据可靠识别到的对话和当前知识库作答，不得虚构客户背景、客户新回复、沟通阶段或未出现的顾虑。",
      "不要输出 OCR 原文、识别说明、知识来源、角色标签、模型信息或内部推理过程。"
    ].join("\n");
  }

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
      "请直接输出完整 Markdown 正文。完整正文必须与“精准回复话术”有明显区别，不能退化为只输出一段可直接发送给客户的话术或几句寒暄。",
      "请先结合已识别的对话和当前知识库，完整说明当前沟通阶段、客户最近消息的真实意图或顾虑，以及作出判断的关键依据；再给出有针对性的解决思路和可执行建议。",
      "存在客户顾虑、异议、情绪或推进需求时，应根据实际情况补充可直接发送的回复示例、下一步沟通节奏及需要注意的风险；不存在的内容不要虚构。",
      "即使客户问题较简单，也要把关键结论、知识库依据和实际怎么做交代完整，不能缩减成一句简短回复。",
      "正文结构、标题、段落数量、篇幅和表达重点由你根据真实对话自行决定；可以使用合适的小标题、分点或连续段落，不得机械套用固定四段模板，也不得为了凑篇幅添加无关内容。",
      "截图信息不足时，只能依据可靠识别到的对话和当前知识库作答，不得虚构客户背景、沟通阶段或未出现的顾虑。",
      "不要输出 OCR 原文、识别说明、知识来源、角色标签、模型信息或内部推理过程。"
    ].join("\n");
  }

  return [
    ...sharedRules,
    "只输出一段可直接复制发给客户的正文，不要输出标题、分析、识别说明、知识来源、角色标签或内部判断过程。",
    ...(modelProvider === "deepseek-pro"
      ? [
          "这是即时通讯中的“精准回复话术”短消息任务，不是长文分析、总结或完整方案。",
          "正文控制在 80 至 160 个中文字符，最多一段、2 至 4 句；只保留自然承接、直接回应和一个必要的追问或下一步。",
          "不要复述整段对话、逐项解释客户经历、堆叠赞美或连续扩写多个段落；达到可直接发送的完整意思后立即结束。"
        ]
      : [])
  ].join("\n");
}

export function buildAdminIngestWechatGroundingRequest(input: {
  input: string;
  attachments: AdminIngestWechatGroundingAttachment[];
  modelProvider?: string | null;
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
  const outputMode = normalizeAdminIngestWechatOutputMode(
    evidenceAttachments.find((attachment) => attachment.wechatOutputMode)?.wechatOutputMode
  );
  const latestStructuredRoleMessage = readLastStructuredRoleMessage(evidence);
  const latestTranscriptMessage = transcript.messages.at(-1) ?? null;
  const evidenceInsufficient = outputMode === "full_answer" && (
    evidence.includes(WECHAT_CURRENT_TURN_ROLE_INSUFFICIENT_MARKER)
    || !latestStructuredRoleMessage
  );
  const waitingForCustomerReply = outputMode === "full_answer"
    && !evidenceInsufficient
    && latestStructuredRoleMessage?.role === "user";
  const latestUserMessage = waitingForCustomerReply
    ? latestStructuredRoleMessage?.text ?? ""
    : "";
  const latestCustomerMessage = evidenceInsufficient || waitingForCustomerReply
    ? ""
    : outputMode === "full_answer" && latestStructuredRoleMessage?.role === "customer"
      ? latestStructuredRoleMessage.text
      : transcript.latestCustomerMessage || readLatestCustomerSummary(evidenceAttachments);
  const baseConversationContext = evidenceInsufficient
    ? []
    : buildConversationContext(
        transcript,
        latestCustomerMessage,
        outputMode === "full_answer" ? transcript.messages.length - 1 : undefined
      );
  const structuredTailAlreadyPresent = Boolean(
    latestStructuredRoleMessage
    && latestTranscriptMessage
    && latestStructuredRoleMessage.role === latestTranscriptMessage.role
    && normalizeComparableText(latestStructuredRoleMessage.text)
      === normalizeComparableText(latestTranscriptMessage.text)
  );
  const conversationContext = outputMode === "full_answer"
    && latestStructuredRoleMessage
    && !structuredTailAlreadyPresent
      ? [
          ...baseConversationContext,
          `${latestStructuredRoleMessage.role === "customer" ? "客户" : "用户已说"}：${latestStructuredRoleMessage.text}`
        ].slice(-MAX_WECHAT_GROUNDING_CONTEXT_MESSAGES)
      : baseConversationContext;
  const query = [
    evidenceInsufficient
      ? "当前回合状态：底部最后一条有效消息证据不足，不得回退到更早消息"
      : waitingForCustomerReply
      ? "当前回合状态：用户已发送最后一条消息，正在等待客户回复"
      : latestCustomerMessage
      ? `客户最近消息：${latestCustomerMessage}`
      : "客户最近消息：未能可靠确定",
    waitingForCustomerReply && latestUserMessage
      ? `用户最后已发送：${latestUserMessage}`
      : "",
    conversationContext.length > 0
      ? waitingForCustomerReply
        ? "截止用户最后已发送消息的对话上下文："
        : "截止客户最近消息的对话上下文："
      : "",
    ...conversationContext
  ].filter(Boolean).join("\n").slice(0, MAX_WECHAT_GROUNDING_QUERY_CHARS);

  return {
    isWechatConversation: true as const,
    strictKnowledgeMode: true as const,
    query,
    modelInput: buildWechatReplyTask(latestCustomerMessage, outputMode, input.modelProvider, {
      waitingForCustomerReply,
      evidenceInsufficient,
      latestUserMessage
    }),
    latestCustomerMessage: latestCustomerMessage || null,
    latestUserMessage: latestUserMessage || null,
    currentTurnState: evidenceInsufficient
      ? "evidence_insufficient" as const
      : waitingForCustomerReply
        ? "waiting_for_customer" as const
        : "reply_required" as const,
    outputMode
  };
}

export function shouldPreserveDeepSeekWechatReplyScript(input: {
  modelProvider?: string | null;
  request: ReturnType<typeof buildAdminIngestWechatGroundingRequest>;
}) {
  return input.modelProvider === "deepseek-pro"
    && input.request.isWechatConversation
    && "outputMode" in input.request
    && input.request.outputMode === "reply_script";
}
