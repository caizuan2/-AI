export type AnswerBlockType =
  | "intro"
  | "paragraph"
  | "list"
  | "heading"
  | "grayBox"
  | "customerScript"
  | "codeCard"
  | "divider";

export type AnswerBlock = {
  type: AnswerBlockType;
  title?: string;
  content: string;
  language?: string;
};

export const CUSTOMER_SCRIPT_TITLE_PATTERN = /可以发给客户这样说|可以这样回复客户|可以这样回复|客户话术|给客户的话术|可复制话术|可直接复制给客户/;
export const GRAY_BOX_TITLE_PATTERN = /^(常见原因|当前结果可以判断为|如果线上还是旧效果|建议操作|下一步|需要检查|示例|配置|命令|重要结论)(?:[，,、\s].*)?$/;
export const GRAY_BOX_LEAD_PATTERN = /^(常见原因|当前结果可以判断为|如果线上还是旧效果|建议操作|下一步|需要检查|示例|配置|命令|重要结论)/;
export const NUMBERED_HEADING_PATTERN = /^\s*(\d{1,2})[.)、]\s+(.{2,42})$/;
export const NUMBERED_TITLE_WORD_PATTERN = /部署|复测|结论|步骤|注意|检查|建议|操作|配置|创建|确认|上线|入库|测试|资格|要求|提醒|重点/;
export const SCHEME_HEADING_PATTERN = /^\s*(方案\s*[A-Za-zＡ-Ｚａ-ｚ]\s*[：:]\s*.{2,80})\s*$/;
export const HORIZONTAL_RULE_PATTERN = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;

function toAnswerText(value: unknown) {
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

function readPath(payload: unknown, keys: Array<string | number>) {
  return keys.reduce<unknown>((current, key) => {
    if (current && typeof current === "object" && key in current) {
      return (current as Record<string | number, unknown>)[key];
    }

    return undefined;
  }, payload);
}

export function extractAnswerFromResponse(responsePayload: unknown): string {
  if (typeof responsePayload === "string") {
    return responsePayload.trim();
  }

  if (!responsePayload || typeof responsePayload !== "object") {
    return "";
  }

  const paths: Array<Array<string | number>> = [
    ["answer"],
    ["content"],
    ["message"],
    ["data", "answer"],
    ["data", "content"],
    ["data", "message"],
    ["result", "answer"],
    ["result", "content"],
    ["result", "message"],
    ["choices", 0, "message", "content"],
    ["choices", 0, "delta", "content"]
  ];

  for (const path of paths) {
    const value = readPath(responsePayload, path);

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

export function extractAnswerFromSseText(text: unknown): string {
  const answerParts: string[] = [];
  const normalizedText = toAnswerText(text);

  for (const rawLine of normalizedText.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line.startsWith("data:")) {
      continue;
    }

    const data = line.slice("data:".length).trim();

    if (!data || data === "[DONE]") {
      continue;
    }

    try {
      const parsed = JSON.parse(data);
      const directAnswer = extractAnswerFromResponse(parsed);

      if (directAnswer) {
        answerParts.push(directAnswer);
        continue;
      }

      const deltaContent =
        readPath(parsed, ["choices", 0, "delta", "content"]) ??
        readPath(parsed, ["choices", 0, "message", "content"]) ??
        readPath(parsed, ["delta"]) ??
        readPath(parsed, ["content"]);

      if (typeof deltaContent === "string") {
        answerParts.push(deltaContent);
      }
    } catch {
      answerParts.push(data);
    }
  }

  return answerParts.join("").trim();
}

export function normalizeSectionTitle(title: string) {
  return title
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\*\*(.+)\*\*$/, "$1")
    .replace(/^__([^_]+)__$/, "$1")
    .replace(/[：:]\s*$/, "")
    .trim();
}

export function normalizeCodeLanguage(language?: string) {
  const normalized = (language || "text").replace(/^language-/, "").trim().toLowerCase();

  if (["ps", "ps1", "powershell"].includes(normalized)) {
    return "PowerShell";
  }

  if (["sh", "shell", "bash", "zsh"].includes(normalized)) {
    return "bash";
  }

  if (normalized === "json") {
    return "JSON";
  }

  if (normalized === "yaml" || normalized === "yml") {
    return "YAML";
  }

  if (normalized === "env") {
    return "env";
  }

  return normalized || "text";
}

function isFenceLine(line: string) {
  return /^\s*```/.test(line);
}

function isStandaloneBulletLine(line: string) {
  return /^\s*(?:[•*-])\s*$/.test(line);
}

function isMarkdownListLine(line: string) {
  return /^\s*(?:[-*+•]\s+\S+|\d+[.)、）]\s+\S+)/.test(line);
}

function readBulletText(line: string) {
  const match = /^\s*[-*+•]\s+(.+)$/.exec(line);

  return match?.[1]?.trim() ?? null;
}

export function isShortQuestionHeading(text: string) {
  const normalized = normalizeSectionTitle(text)
    .replace(/^[-*+•]\s+/, "")
    .trim();

  if (!normalized || Array.from(normalized).length > 34) {
    return false;
  }

  if (/[，,。；;：:]/.test(normalized)) {
    return false;
  }

  return /[？?]$/.test(normalized) ||
    /^(为什么|为何)/.test(normalized) ||
    /(可以吗|适合哪些人|有什么作用|怎么吃|注意什么|怎么用|能不能|可不可以)/.test(normalized);
}

function findNextMeaningfulLine(lines: string[], startIndex: number) {
  let cursor = startIndex;

  while (cursor < lines.length) {
    const line = lines[cursor] ?? "";

    if (line.trim()) {
      return { index: cursor, line };
    }

    cursor += 1;
  }

  return null;
}

function hasLikelyExplanationAfter(lines: string[], index: number) {
  const next = findNextMeaningfulLine(lines, index + 1);

  if (!next || isFenceLine(next.line) || isStandaloneBulletLine(next.line)) {
    return false;
  }

  const nextText = (readBulletText(next.line) ?? next.line.trim()).trim();

  return Boolean(nextText && !isShortQuestionHeading(nextText));
}

function isShortTitleBeforeList(line: string, lines: string[], index: number) {
  const trimmed = line.trim();

  if (
    !trimmed ||
    trimmed.length > 18 ||
    /[。！？!?；;]$/.test(trimmed) ||
    /^(?:#{1,6}\s+|\*\*.+\*\*$|__.+__$|>\s*)/.test(trimmed) ||
    isMarkdownListLine(trimmed) ||
    isStandaloneBulletLine(trimmed) ||
    isFenceLine(trimmed)
  ) {
    return false;
  }

  const next = findNextMeaningfulLine(lines, index + 1);

  return Boolean(next && (isStandaloneBulletLine(next.line) || isMarkdownListLine(next.line.trim())));
}

export function normalizeAnswerMarkdown(input?: unknown): string {
  const lines = toAnswerText(input).replace(/\r\n/g, "\n").split("\n");
  const normalizedLines: string[] = [];
  let insideFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (isFenceLine(line)) {
      insideFence = !insideFence;
      normalizedLines.push(line);
      continue;
    }

    if (insideFence) {
      normalizedLines.push(line);
      continue;
    }

    const listText = readBulletText(line);

    if (listText && isShortQuestionHeading(listText) && hasLikelyExplanationAfter(lines, index)) {
      normalizedLines.push(`**${listText}**`);
      continue;
    }

    const bulletWithText = /^\s*[•*]\s+(.+)$/.exec(line);

    if (bulletWithText) {
      normalizedLines.push(`- ${bulletWithText[1]?.trim() ?? ""}`);
      continue;
    }

    if (isStandaloneBulletLine(line)) {
      const next = findNextMeaningfulLine(lines, index + 1);

      if (next && !isFenceLine(next.line) && !isStandaloneBulletLine(next.line) && !isMarkdownListLine(next.line.trim())) {
        const nextText = next.line.trim();
        const nextIsQuestionHeading = isShortQuestionHeading(nextText) && hasLikelyExplanationAfter(lines, next.index);

        normalizedLines.push(nextIsQuestionHeading ? `**${nextText}**` : `- ${nextText}`);
        index = next.index;
      }

      continue;
    }

    if (isShortTitleBeforeList(line, lines, index)) {
      normalizedLines.push(`**${trimmed.replace(/[：:]\s*$/, "")}**`);
      continue;
    }

    normalizedLines.push(line);
  }

  return normalizedLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function isGrayBoxTitle(title: string) {
  return GRAY_BOX_TITLE_PATTERN.test(title) || GRAY_BOX_LEAD_PATTERN.test(title);
}

function readSectionHeading(line: string, previousLine = "", nextLine = "") {
  const trimmed = line.trim();

  if (!trimmed) {
    return null;
  }

  const markdownHeading = /^(#{1,4})\s+(.+)$/.exec(trimmed);

  if (markdownHeading) {
    return normalizeSectionTitle(markdownHeading[2] ?? "");
  }

  const strongHeading = /^\*\*(.+?)\*\*\s*$/.exec(trimmed) ?? /^__(.+?)__\s*$/.exec(trimmed);

  if (strongHeading) {
    return normalizeSectionTitle(strongHeading[1] ?? "");
  }

  const schemeHeading = SCHEME_HEADING_PATTERN.exec(trimmed);

  if (schemeHeading) {
    return normalizeSectionTitle(schemeHeading[1] ?? "");
  }

  const numberedHeading = NUMBERED_HEADING_PATTERN.exec(trimmed);

  if (numberedHeading) {
    const titleText = normalizeSectionTitle(numberedHeading[2] ?? "");
    const previousIsBlank = !previousLine.trim();
    const nextIsBlank = !nextLine.trim();
    const looksLikeTitle = !/[。！？!?；;]$/.test(titleText) &&
      titleText.length <= 42 &&
      (NUMBERED_TITLE_WORD_PATTERN.test(titleText) || previousIsBlank || nextIsBlank);

    if (looksLikeTitle) {
      return `${numberedHeading[1]}. ${titleText}`;
    }
  }

  const colonHeading = /^(.{2,48})[：:]\s*$/.exec(trimmed);

  if (colonHeading) {
    const title = normalizeSectionTitle(colonHeading[1] ?? "");

    if (CUSTOMER_SCRIPT_TITLE_PATTERN.test(title) || isGrayBoxTitle(title)) {
      return title;
    }
  }

  return null;
}

function getSectionType(title: string): Extract<AnswerBlockType, "heading" | "grayBox" | "customerScript"> {
  if (CUSTOMER_SCRIPT_TITLE_PATTERN.test(title)) {
    return "customerScript";
  }

  if (isGrayBoxTitle(title)) {
    return "grayBox";
  }

  return "heading";
}

function isListBlock(content: string) {
  const meaningfulLines = content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return meaningfulLines.length > 0 &&
    meaningfulLines.every((line) => /^(?:[-*+]\s+|\d+[.)、）]\s+)/.test(line));
}

function inferPlainBlockType(content: string): Extract<AnswerBlockType, "paragraph" | "list"> {
  return isListBlock(content) ? "list" : "paragraph";
}

function parseAnswerBlocksUnsafe(answerMarkdown: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  const lines = answerMarkdown.replace(/\r\n/g, "\n").split("\n");
  let currentTitle = "";
  let currentType: Extract<AnswerBlockType, "intro" | "grayBox" | "customerScript"> = "intro";
  let currentLines: string[] = [];

  const flush = () => {
    const content = currentLines.join("\n").trim();

    if (!content) {
      currentLines = [];
      currentTitle = "";
      currentType = "intro";
      return;
    }

    const type = currentType === "intro" ? inferPlainBlockType(content) : currentType;

    blocks.push({
      type,
      title: currentTitle || undefined,
      content
    });
    currentLines = [];
    currentTitle = "";
    currentType = "intro";
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const codeStart = /^```([\w-]*)\s*$/.exec(line.trim());

    if (HORIZONTAL_RULE_PATTERN.test(line)) {
      flush();
      blocks.push({
        type: "divider",
        content: ""
      });
      continue;
    }

    if (codeStart) {
      flush();

      const codeLines: string[] = [];
      let cursor = index + 1;

      while (cursor < lines.length && !/^```\s*$/.test((lines[cursor] ?? "").trim())) {
        codeLines.push(lines[cursor] ?? "");
        cursor += 1;
      }

      blocks.push({
        type: "codeCard",
        content: codeLines.join("\n").trimEnd(),
        language: codeStart[1] || "text"
      });

      index = cursor;
      continue;
    }

    const heading = readSectionHeading(line, lines[index - 1] ?? "", lines[index + 1] ?? "");

    if (heading) {
      flush();
      const nextType = getSectionType(heading);

      if (nextType === "heading") {
        blocks.push({
          type: "heading",
          title: heading,
          content: ""
        });
      } else {
        currentTitle = heading;
        currentType = nextType;
      }
      continue;
    }

    currentLines.push(line);
  }

  flush();

  return blocks.length > 0 ? blocks : [{ type: "intro", content: answerMarkdown }];
}

export function parseAnswerBlocks(answerMarkdown?: unknown): AnswerBlock[] {
  const answerText = normalizeAnswerMarkdown(answerMarkdown);

  try {
    return parseAnswerBlocksUnsafe(answerText);
  } catch (error) {
    console.error("answer.parse_blocks_failed", error);
    return [{ type: "intro", content: answerText }];
  }
}
