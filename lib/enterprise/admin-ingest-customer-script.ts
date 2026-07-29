export type AdminIngestCustomerScriptTarget = {
  startLineIndex: number;
  endLineIndex: number;
  copyText: string;
  sourceMarkdown: string;
};

type MarkdownFence = {
  marker: "`" | "~";
  length: number;
};

const CUSTOMER_SCRIPT_CUE_PATTERN =
  /(?:(?:客户|顾客).{0,10}(?:话术|回复|回应|沟通|怎么说|怎么回)|(?:回复|回应|沟通|话术).{0,10}(?:客户|顾客)|开场话术|破冰话术|邀约话术|跟进话术|追问后|怎么接|如何接|这样说|这么说|这样回|这么回|直接说|直接回|直接发|可以说|可以回|可以发|发给|发这一段|发一段|口吻|她说|他说|对方说|如果.{0,20}说)/i;

const NON_CUSTOMER_QUOTE_PATTERN =
  /(?:引用来源|参考来源|资料来源|来源说明|知识库原文|资料原文|原文摘录|证据|出处|免责声明|风险提示|注意事项|使用提醒|重要提醒|安全提醒|警告|限制条件|为什么有效|背后策略|话术分析|话术拆解|结构分析|核心作用|故事骨架)/i;

function normalizeContextLine(line: string) {
  return line
    .trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\*\*([\s\S]+)\*\*$/, "$1")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+[.)、]\s+/, "")
    .replace(/[：:]\s*$/, "")
    .trim();
}

function isHeadingLike(line: string) {
  const trimmed = line.trim();
  const normalized = normalizeContextLine(line);

  return /^#{1,6}\s+/.test(trimmed)
    || /^\*\*[\s\S]+\*\*$/.test(trimmed)
    || (normalized.length > 0 && normalized.length <= 36 && /[：:]$/.test(trimmed));
}

function readFence(line: string) {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);

  if (!match) {
    return null;
  }

  return {
    marker: match[1][0] as MarkdownFence["marker"],
    length: match[1].length
  };
}

function closesFence(line: string, fence: MarkdownFence) {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);

  return Boolean(
    match
    && match[1][0] === fence.marker
    && match[1].length >= fence.length
  );
}

function stripInlineDisplayMarkdown(text: string) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

export function toAdminIngestCustomerScriptCopyText(lines: string[]) {
  return stripInlineDisplayMarkdown(
    lines
      .map((line) => line.replace(/^ {0,3}>\s?/, ""))
      .join("\n")
  ).trim();
}

function isCustomerScriptContext(input: {
  currentHeading: string;
  currentHeadingContextAge: number;
  recentContext: string[];
}) {
  const recentText = input.recentContext.slice(-4).join("\n");
  const activeHeading = input.currentHeadingContextAge <= 6
    ? input.currentHeading
    : "";
  const positiveContext = [activeHeading, recentText]
    .filter(Boolean)
    .join("\n");

  if (!CUSTOMER_SCRIPT_CUE_PATTERN.test(positiveContext)) {
    return false;
  }

  const closestContext = input.recentContext.at(-1) || activeHeading;

  if (closestContext && NON_CUSTOMER_QUOTE_PATTERN.test(closestContext)) {
    return false;
  }

  if (
    activeHeading
    && NON_CUSTOMER_QUOTE_PATTERN.test(activeHeading)
  ) {
    return false;
  }

  return true;
}

function isUsableCustomerScript(copyText: string) {
  const compactText = copyText.replace(/\s+/g, "");

  return compactText.length >= 12;
}

export function extractAdminIngestCustomerScriptTargets(
  markdown: string
): AdminIngestCustomerScriptTarget[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const targets: AdminIngestCustomerScriptTarget[] = [];
  const recentContext: string[] = [];
  let activeFence: MarkdownFence | null = null;
  let currentHeading = "";
  let currentHeadingContextAge = Number.POSITIVE_INFINITY;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (activeFence) {
      if (closesFence(line, activeFence)) {
        activeFence = null;
      }
      continue;
    }

    if (/^(?: {4,}|\t)/.test(line)) {
      continue;
    }

    const openingFence = readFence(line);

    if (openingFence) {
      activeFence = openingFence;
      continue;
    }

    if (/^ {0,3}>/.test(line)) {
      const startLineIndex = index;
      const quoteLines: string[] = [];

      while (index < lines.length && /^ {0,3}>/.test(lines[index])) {
        quoteLines.push(lines[index]);
        index += 1;
      }

      const endLineIndex = index;
      const copyText = toAdminIngestCustomerScriptCopyText(quoteLines);

      if (
        isUsableCustomerScript(copyText)
        && isCustomerScriptContext({
          currentHeading,
          currentHeadingContextAge,
          recentContext
        })
      ) {
        targets.push({
          startLineIndex,
          endLineIndex,
          copyText,
          sourceMarkdown: quoteLines.join("\n")
        });
      }

      index -= 1;
      continue;
    }

    const normalizedLine = normalizeContextLine(line);

    if (!normalizedLine) {
      continue;
    }

    if (isHeadingLike(line)) {
      currentHeading = normalizedLine;
      currentHeadingContextAge = 0;
    } else if (Number.isFinite(currentHeadingContextAge)) {
      currentHeadingContextAge += 1;
    }

    recentContext.push(normalizedLine);

    if (recentContext.length > 8) {
      recentContext.shift();
    }
  }

  return targets;
}
