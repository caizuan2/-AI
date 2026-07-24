export type AdminIngestWechatRole = "customer" | "user" | "uncertain";

export interface AdminIngestWechatOcrLine {
  text: string;
  confidence: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  imageWidth: number;
  roleHint?: AdminIngestWechatRole;
}

export interface AdminIngestWechatTranscriptMessage {
  role: Exclude<AdminIngestWechatRole, "uncertain">;
  text: string;
  y: number;
  confidence: number;
}

export interface AdminIngestWechatSegment {
  top: number;
  height: number;
}

export type AdminIngestWechatTranscriptReliabilityReason =
  | "LOW_OCR_CONFIDENCE"
  | "NO_CUSTOMER_MESSAGE"
  | "TOO_FEW_MESSAGES"
  | "TOO_MANY_UNCERTAIN_LINES"
  | "TOO_MANY_NOISY_LINES"
  | "INCOMPLETE_SEGMENTS";

export interface AdminIngestWechatTranscriptReliability {
  reliable: boolean;
  uncertainRatio: number;
  noisyLineRatio: number;
  reasons: AdminIngestWechatTranscriptReliabilityReason[];
}

const DEFAULT_TARGET_SEGMENT_HEIGHT = 2_400;
const DEFAULT_SEGMENT_OVERLAP = 360;
const DEFAULT_MAX_SEGMENTS = 12;
const MAX_RELIABLE_UNCERTAIN_LINE_RATIO = 0.35;
const MAX_RELIABLE_NOISY_LINE_RATIO = 0.08;
const COMMON_SHORT_CUSTOMER_REPLIES = [
  "您先忙",
  "你先忙",
  "好的",
  "谢谢",
  "不客气",
  "知道了",
  "可以",
  "回头聊"
];

function normalizeComparableText(value: string) {
  return value
    .replace(/\s+/g, "")
    .replace(/[，,。；;！？!?：:'"“”‘’（）()【】\[\]…·~～—-]/g, "")
    .toLowerCase();
}

function cleanOcrLine(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

function isLikelyOcrNoise(text: string) {
  const cjkCount = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
  const latinNumberCount = (text.match(/[a-zA-Z0-9]/g) ?? []).length;
  const evidenceCount = cjkCount + latinNumberCount;

  if (evidenceCount < 2) {
    return true;
  }

  return cjkCount === 0 && latinNumberCount < 3;
}

function isLikelyWechatOcrGarbage(text: string) {
  const cjkCount = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
  const latinNumberCount = (text.match(/[a-zA-Z0-9]/g) ?? []).length;
  const evidenceCount = cjkCount + latinNumberCount;

  if (evidenceCount < 3) {
    return false;
  }

  if (cjkCount === 0 && latinNumberCount >= 3) {
    return true;
  }

  return cjkCount <= 3
    && latinNumberCount >= 3
    && latinNumberCount / evidenceCount >= 0.5;
}

function normalizeLatestCustomerMessage(text: string) {
  for (const reply of COMMON_SHORT_CUSTOMER_REPLIES) {
    if (text.startsWith(reply) && text.slice(reply.length).replace(/\s+/g, "").length <= 1) {
      return reply;
    }
  }

  return text;
}

function isLikelyCustomerReplyTarget(text: string) {
  const normalized = normalizeComparableText(text);

  if (!normalized) {
    return false;
  }

  if (COMMON_SHORT_CUSTOMER_REPLIES.some((reply) => normalized === normalizeComparableText(reply))) {
    return true;
  }

  if (normalized.length >= 6) {
    return true;
  }

  return /[?？]|(?:吗|呢|怎么|为什么|多少|哪里|哪儿|是否|是不是|能不能|可不可以|贵|难|怕|担心|考虑|没成功|没效果|不想|不行|不懂|不明白|先忙|回头聊)/.test(text);
}

function selectLatestCustomerMessage(messages: AdminIngestWechatTranscriptMessage[]) {
  const latest = [...messages]
    .reverse()
    .find((message) => normalizeComparableText(message.text).length >= 2);

  if (!latest) {
    return "";
  }

  const replyTarget = [...messages]
    .reverse()
    .find((message) => isLikelyCustomerReplyTarget(message.text));

  return normalizeLatestCustomerMessage((replyTarget ?? latest).text);
}

function isWechatChromeOrTimestamp(text: string, xRatio: number) {
  const normalized = text.replace(/\s+/g, "");

  if (/^(?:\d{1,2}:\d{2}|上午\d{1,2}:\d{2}|下午\d{1,2}:\d{2}|昨天|星期[一二三四五六日天]|周[一二三四五六日天])$/.test(normalized)) {
    return true;
  }

  return (
    xRatio > 0.34
    && xRatio < 0.66
    && /^(?:以下为新消息|对方已撤回一条消息|你撤回了一条消息|消息已发出|查看更多消息)$/.test(normalized)
  ) || /(?:撤回.{0,4}(?:一条)?消息|条消息.{0,4}重新编辑|群发助手.{0,10}(?:消息|发出))/.test(normalized);
}

export function calculateAdminIngestWechatSegments(
  height: number,
  options: {
    targetHeight?: number;
    overlap?: number;
    maxSegments?: number;
  } = {}
): AdminIngestWechatSegment[] {
  const targetHeight = Math.max(800, Math.floor(options.targetHeight ?? DEFAULT_TARGET_SEGMENT_HEIGHT));
  const overlap = Math.min(targetHeight - 200, Math.max(80, Math.floor(options.overlap ?? DEFAULT_SEGMENT_OVERLAP)));
  const maxSegments = Math.max(1, Math.floor(options.maxSegments ?? DEFAULT_MAX_SEGMENTS));

  if (!Number.isFinite(height) || height <= targetHeight) {
    return [{ top: 0, height: Math.max(1, Math.floor(height || targetHeight)) }];
  }

  const stride = targetHeight - overlap;
  const requestedCount = Math.max(2, Math.ceil((height - overlap) / stride));
  const count = Math.min(maxSegments, requestedCount);
  const segmentHeight = Math.ceil((height + overlap * (count - 1)) / count);
  const segmentStride = segmentHeight - overlap;

  return Array.from({ length: count }, (_, index) => {
    const top = Math.min(index * segmentStride, Math.max(0, height - 1));

    return {
      top,
      height: Math.min(segmentHeight, height - top)
    };
  }).filter((segment) => segment.height > 0);
}

export function classifyAdminIngestWechatLine(line: AdminIngestWechatOcrLine): AdminIngestWechatRole {
  if (line.roleHint && line.roleHint !== "uncertain") {
    return line.roleHint;
  }

  const center = (line.x0 + line.x1) / 2;
  const ratio = line.imageWidth > 0 ? center / line.imageWidth : 0.5;

  if (ratio <= 0.47) {
    return "customer";
  }

  if (ratio >= 0.53) {
    return "user";
  }

  return "uncertain";
}

export function inferAdminIngestWechatRoleHintFromColor(input: {
  greenPixelRatio: number;
  lightPixelRatio: number;
  x0: number;
  x1: number;
  imageWidth: number;
}): AdminIngestWechatRole {
  const greenPixelRatio = Number.isFinite(input.greenPixelRatio)
    ? Math.max(0, Math.min(1, input.greenPixelRatio))
    : 0;
  const lightPixelRatio = Number.isFinite(input.lightPixelRatio)
    ? Math.max(0, Math.min(1, input.lightPixelRatio))
    : 0;
  const imageWidth = Math.max(1, input.imageWidth);
  const leftRatio = input.x0 / imageWidth;
  const centerRatio = ((input.x0 + input.x1) / 2) / imageWidth;

  if (greenPixelRatio >= 0.12) {
    return "user";
  }

  if (
    lightPixelRatio >= 0.45
    && leftRatio <= 0.38
    && centerRatio <= 0.68
  ) {
    return "customer";
  }

  return "uncertain";
}

export function assessAdminIngestWechatTranscriptReliability(input: {
  confidence: number;
  messageCount: number;
  customerMessageCount: number;
  uncertainLineCount: number;
  segmentCount: number;
  recognizedSegmentCount: number;
  latestCustomerMessage: string;
  noisyLineCount?: number;
}): AdminIngestWechatTranscriptReliability {
  const messageCount = Math.max(0, Math.floor(input.messageCount));
  const customerMessageCount = Math.max(0, Math.floor(input.customerMessageCount));
  const uncertainLineCount = Math.max(0, Math.floor(input.uncertainLineCount));
  const totalClassifiedLines = messageCount + uncertainLineCount;
  const uncertainRatio = totalClassifiedLines > 0
    ? uncertainLineCount / totalClassifiedLines
    : 1;
  const noisyLineCount = Math.max(0, Math.floor(input.noisyLineCount ?? 0));
  const noisyLineRatio = messageCount > 0
    ? noisyLineCount / messageCount
    : 1;
  const reasons: AdminIngestWechatTranscriptReliabilityReason[] = [];

  if (!Number.isFinite(input.confidence) || input.confidence < 60) {
    reasons.push("LOW_OCR_CONFIDENCE");
  }

  if (messageCount < 2) {
    reasons.push("TOO_FEW_MESSAGES");
  }

  if (customerMessageCount < 1 || !cleanOcrLine(input.latestCustomerMessage)) {
    reasons.push("NO_CUSTOMER_MESSAGE");
  }

  if (uncertainRatio > MAX_RELIABLE_UNCERTAIN_LINE_RATIO) {
    reasons.push("TOO_MANY_UNCERTAIN_LINES");
  }

  if (noisyLineCount >= 4 && noisyLineRatio > MAX_RELIABLE_NOISY_LINE_RATIO) {
    reasons.push("TOO_MANY_NOISY_LINES");
  }

  if (
    input.segmentCount <= 0
    || input.recognizedSegmentCount < input.segmentCount
  ) {
    reasons.push("INCOMPLETE_SEGMENTS");
  }

  return {
    reliable: reasons.length === 0,
    uncertainRatio,
    noisyLineRatio,
    reasons
  };
}

function isNearDuplicate(
  left: AdminIngestWechatTranscriptMessage,
  right: AdminIngestWechatTranscriptMessage,
  overlapDistance: number
) {
  if (left.role !== right.role || Math.abs(left.y - right.y) > overlapDistance) {
    return false;
  }

  const leftText = normalizeComparableText(left.text);
  const rightText = normalizeComparableText(right.text);

  if (!leftText || !rightText) {
    return false;
  }

  return leftText === rightText
    || (Math.min(leftText.length, rightText.length) >= 6
      && (leftText.includes(rightText) || rightText.includes(leftText)));
}

export function buildAdminIngestWechatTranscript(
  lines: AdminIngestWechatOcrLine[],
  options: { overlapDistance?: number } = {}
) {
  const overlapDistance = Math.max(120, options.overlapDistance ?? 520);
  const candidates: AdminIngestWechatTranscriptMessage[] = [];
  let uncertainCount = 0;
  let noisyCount = 0;

  for (const line of [...lines].sort((left, right) => left.y0 - right.y0 || left.x0 - right.x0)) {
    const text = cleanOcrLine(line.text);
    const role = classifyAdminIngestWechatLine(line);
    const centerRatio = line.imageWidth > 0 ? ((line.x0 + line.x1) / 2) / line.imageWidth : 0.5;

    if (!text || isLikelyOcrNoise(text) || isWechatChromeOrTimestamp(text, centerRatio)) {
      continue;
    }

    if (isLikelyWechatOcrGarbage(text)) {
      noisyCount += 1;
    }

    if (role === "uncertain") {
      uncertainCount += 1;
      continue;
    }

    const candidate: AdminIngestWechatTranscriptMessage = {
      role,
      text,
      y: line.y0,
      confidence: line.confidence
    };
    const duplicateIndex = candidates.findIndex((item) => isNearDuplicate(item, candidate, overlapDistance));

    if (duplicateIndex >= 0) {
      const existing = candidates[duplicateIndex];
      const existingTruncated = /\[截断\]/.test(existing.text);
      const candidateTruncated = /\[截断\]/.test(candidate.text);
      const candidateHasBetterBoundary = existingTruncated && !candidateTruncated;
      const candidateHasMoreEvidence = candidate.confidence === existing.confidence
        && normalizeComparableText(candidate.text).length > normalizeComparableText(existing.text).length;

      if (
        candidate.confidence > existing.confidence
        || candidateHasBetterBoundary
        || candidateHasMoreEvidence
      ) {
        candidates[duplicateIndex] = candidate;
      }
      continue;
    }

    candidates.push(candidate);
  }

  const messages = candidates.sort((left, right) => left.y - right.y);
  const customerMessages = messages.filter((message) => message.role === "customer");
  const transcript = messages.map((message) => (
    `${message.role === "customer" ? "客户(左侧)" : "我(右侧)"}：${message.text}`
  )).join("\n");

  return {
    messages,
    transcript,
    latestCustomerMessage: selectLatestCustomerMessage(customerMessages),
    uncertainCount,
    noisyCount
  };
}

export function parseAdminIngestWechatRoleTranscript(value: string) {
  const lines: AdminIngestWechatOcrLine[] = [];

  for (const rawLine of value.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    const match = line.match(/^(客户|我)\s*[（(](左侧|右侧)[）)]\s*[：:]\s*(.+)$/);

    if (!match || /\d+\/\d+\s*段未识别/.test(line)) {
      continue;
    }

    const customer = match[1] === "客户" && match[2] === "左侧";
    const user = match[1] === "我" && match[2] === "右侧";

    if (!customer && !user) {
      continue;
    }

    lines.push({
      text: match[3],
      confidence: 100,
      x0: customer ? 40 : 560,
      x1: customer ? 320 : 840,
      y0: lines.length * 100,
      y1: lines.length * 100 + 60,
      imageWidth: 880,
      roleHint: customer ? "customer" : "user"
    });
  }

  return buildAdminIngestWechatTranscript(lines, { overlapDistance: 160 });
}

function textMatchScore(left: string, right: string) {
  const normalizedLeft = normalizeComparableText(left);
  const normalizedRight = normalizeComparableText(right);

  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }

  if (normalizedLeft === normalizedRight) {
    return 1;
  }

  const shorterLength = Math.min(normalizedLeft.length, normalizedRight.length);
  const longerLength = Math.max(normalizedLeft.length, normalizedRight.length);
  let score = 0;

  if (
    shorterLength >= 4
    && (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft))
  ) {
    score = shorterLength / longerLength;
  }

  const cjkLeft = normalizedLeft.replace(/[^\u3400-\u9fff]/g, "");
  const cjkRight = normalizedRight.replace(/[^\u3400-\u9fff]/g, "");

  if (
    Math.min(cjkLeft.length, cjkRight.length) >= 3
    && (
      cjkLeft === cjkRight
      || cjkLeft.includes(cjkRight)
      || cjkRight.includes(cjkLeft)
    )
  ) {
    score = Math.max(
      score,
      Math.min(cjkLeft.length, cjkRight.length)
        / Math.max(cjkLeft.length, cjkRight.length)
    );
  }

  return score;
}

export function reconcileAdminIngestWechatRoleTranscripts(input: {
  visionTranscript: string;
  localTranscript: string;
}) {
  const vision = parseAdminIngestWechatRoleTranscript(input.visionTranscript);
  const local = parseAdminIngestWechatRoleTranscript(input.localTranscript);
  const reconciledLines: AdminIngestWechatOcrLine[] = vision.messages.map((message, index) => {
    let bestMatch: AdminIngestWechatTranscriptMessage | null = null;
    let bestScore = 0;
    let bestPositionDistance = Number.POSITIVE_INFINITY;
    const visionPosition = vision.messages.length > 1
      ? index / (vision.messages.length - 1)
      : 0;

    for (let candidateIndex = 0; candidateIndex < local.messages.length; candidateIndex += 1) {
      const candidate = local.messages[candidateIndex];
      const score = textMatchScore(message.text, candidate.text);
      const localPosition = local.messages.length > 1
        ? candidateIndex / (local.messages.length - 1)
        : 0;
      const positionDistance = Math.abs(visionPosition - localPosition);

      if (
        score > bestScore
        || (score === bestScore && positionDistance < bestPositionDistance)
      ) {
        bestMatch = candidate;
        bestScore = score;
        bestPositionDistance = positionDistance;
      }
    }

    const role = bestMatch && bestScore >= 0.72
      ? bestMatch.role
      : message.role;

    return {
      text: message.text,
      confidence: message.confidence,
      x0: role === "customer" ? 40 : 560,
      x1: role === "customer" ? 320 : 840,
      y0: index * 100,
      y1: index * 100 + 60,
      imageWidth: 880,
      roleHint: role
    };
  });

  return buildAdminIngestWechatTranscript(reconciledLines, { overlapDistance: 160 });
}

export function buildAdminIngestWechatReplyEvidence(input: {
  transcript: string;
  latestCustomerMessage: string;
  partial?: boolean;
}) {
  return [
    "【微信对话截图识别稿】",
    input.transcript,
    "",
    "【固定角色规则】",
    "客户(左侧)表示左侧头像或白色气泡；我(右侧)表示上传截图的用户本人或右侧绿色气泡。",
    "右侧消息只作为已经说过的话和对话背景，绝不能把右侧消息当成客户问题。",
    input.latestCustomerMessage
      ? `从截图底部向上识别到的最近客户消息：${input.latestCustomerMessage}`
      : "未能可靠确定最近客户消息。",
    input.partial ? "截图存在未识别片段，只能基于已识别对话作答，不得补写缺失内容。" : "",
    "",
    "【回答任务】",
    "结合完整上下文判断客户最后一个问题、顾虑或需要回应的话，只输出一段可直接发给客户的答案正文。",
    "不要输出识别稿、客户问题分析、回复思路、左右角色标签、标题、前言、模型信息或内部判断过程。"
  ].filter(Boolean).join("\n");
}
