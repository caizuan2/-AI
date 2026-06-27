const RELATED_MATERIAL = "相关资料";
const CLEAN_REFERENCE = "已参考小董AI大脑🧠中的相关资料。";
const NO_REFERENCE = "小董AI大脑🧠暂无明确命中，建议结合实际情况确认。";

const lineRemovalPatterns: RegExp[] = [
  /\b(?:model_select|model_reason|model_metrics|model_fallback)\b[^，。；！？\n]*/gi,
  /\b(?:prompt\.education|prompt\.proof|prompt\.handoff)\b[^，。；！？\n]*/gi,
  /\b(?:conversion_signal|global learning)\b[^，。；！？\n]*/gi,
  /\b(?:debug|fallback|rules)\b[^，。；！？\n]*/gi,
  /\b(?:score|rank|embedding)\b[^，。；！？\n]*/gi
];

const inlineReplacementPatterns: Array<[RegExp, string]> = [
  [/\bXD-RAG-(?:ADMIN-LOGIN|LINK)-20260626\b/gi, RELATED_MATERIAL],
  [/\bXD-RAG\b(?:-[A-Z0-9-]+)?/gi, RELATED_MATERIAL],
  [/\bADMIN-LOGIN\b(?:-\d+)?/gi, RELATED_MATERIAL],
  [/\bLINK-20260626\b/gi, RELATED_MATERIAL],
  [/\b(?:sourceApp|source_app)\s*[:=：]\s*[\w-]+/gi, ""],
  [/\b(?:chunkId|chunk_id)\s*[:=：#-]?\s*[\w-]*/gi, ""],
  [/\bchunk\s*[:=：#-]?\s*[\w-]*/gi, ""],
  [/\b(?:ingest_admin|admin_ingest|admin_feed)\b/gi, "小董AI大脑"],
  [/\b(?:cold_user|warm_user|hot_user|buyer_user)\b/gi, ""],
  [/\bACTION_\d*\b\s*[:：-]?\s*/gi, ""],
  [/AI\s+Knowledge\s+OS\s+V[6-9](?:\.\d+)?/gi, ""],
  [/\b(?:qwen|deepseek|kimi|glm)\b/gi, ""],
  [/回答分析|分析细节/gi, ""]
];

function normalizeVisibleWhitespace(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]+([，。；：！？])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripEmptyListMarkers(value: string) {
  return value
    .split("\n")
    .map((line) => line.replace(/^\s*[-*•\d.、)\s]+$/, "").trimEnd())
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

export function sanitizeVisibleText(input: string | null | undefined): string {
  let text = normalizeVisibleWhitespace(input ?? "");

  if (!text) {
    return "";
  }

  for (const pattern of lineRemovalPatterns) {
    text = text.replace(pattern, "");
  }

  for (const [pattern, replacement] of inlineReplacementPatterns) {
    text = text.replace(pattern, replacement);
  }

  text = text
    .replace(/\(\s*\)/g, "")
    .replace(/（\s*）/g, "")
    .replace(/[，,]\s*[，,；;：:]+/g, "，")
    .replace(/([，。；：！？])\s+\1+/g, "$1")
    .replace(/\s+([，。；：！？])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/(?:相关资料\s*){2,}/g, RELATED_MATERIAL)
    .replace(/小董AI大脑\s*小董AI大脑/g, "小董AI大脑");

  return stripEmptyListMarkers(normalizeVisibleWhitespace(text));
}

function cleanSourceTitle(value: unknown, index: number) {
  const text = sanitizeVisibleText(typeof value === "string" ? value : "");

  if (!text || text === RELATED_MATERIAL || /相关资料/.test(text)) {
    return `小董AI大脑资料 ${index + 1}`;
  }

  return text;
}

export function sanitizeVisibleSources<T extends { title?: unknown; summary?: unknown; content?: unknown }>(sources: T[] | undefined): Array<{
  title: string;
  summary?: string;
}> {
  return (sources ?? []).map((source, index) => {
    const title = cleanSourceTitle(source.title, index);
    const summary = sanitizeVisibleText(
      typeof source.summary === "string"
        ? source.summary
        : typeof source.content === "string"
          ? source.content
          : undefined
    );

    return summary ? { title, summary } : { title };
  });
}

export function getCleanEvidenceSummary(hasSources: boolean) {
  return hasSources ? CLEAN_REFERENCE : NO_REFERENCE;
}
