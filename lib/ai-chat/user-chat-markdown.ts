const USER_CHAT_HEADING_TITLES = [
  "一句话思路",
  "三条现成话术",
  "下一步动作",
  "下一步建议",
  "复制这句话给他",
  "复制给客户",
  "客户可复制话术",
  "核心结论",
  "第一步",
  "第二步",
  "第三步",
  "第四步"
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const userChatHeadingTitlePattern = USER_CHAT_HEADING_TITLES.map(escapeRegExp).join("|");
const inlineHeadingTitleRegex = new RegExp(`(#{1,4}\\s*(?:${userChatHeadingTitlePattern})\\s*[：:]?)\\s+`, "g");
const supportedHtmlTagPattern = /&lt;\s*(\/?)\s*(ul|ol|li|p|br|strong|b|em|i)\b(?:[^&<>]|&(?!gt;))*?\s*(\/?)\s*&gt;/gi;

function decodeSupportedHtmlTags(value: string) {
  return value
    .replace(supportedHtmlTagPattern, (_match, slash: string, tagName: string, selfClosing: string) => (
      `<${slash ? "/" : ""}${tagName.toLowerCase()}${selfClosing ? "/" : ""}>`
    ))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'");
}

function normalizeHtmlFragments(value: string) {
  return decodeSupportedHtmlTags(value)
    .replace(/<\s*(?:ul|ol)\b[^>]*>/gi, "\n")
    .replace(/<\s*\/\s*(?:ul|ol)\s*>/gi, "\n")
    .replace(/<\s*li\b[^>]*>/gi, "\n- ")
    .replace(/<\s*\/\s*li\s*>/gi, "\n")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*p\b[^>]*>/gi, "\n\n")
    .replace(/<\s*\/\s*p\s*>/gi, "\n\n")
    .replace(/<\s*(?:strong|b)\b[^>]*>/gi, "**")
    .replace(/<\s*\/\s*(?:strong|b)\s*>/gi, "**")
    .replace(/<\s*(?:em|i)\b[^>]*>/gi, "*")
    .replace(/<\s*\/\s*(?:em|i)\s*>/gi, "*")
    .replace(/<\s*\/?\s*[A-Za-z][A-Za-z0-9:-]*(?:\s+[^<>]*)?\s*\/?\s*>/g, "");
}

export function normalizeUserChatMarkdown(value: string) {
  let text = value
    .replace(/\r\n/g, "\n")
    .replace(/\u200b/g, "")
    .trim();

  if (!text) {
    return "";
  }

  text = normalizeHtmlFragments(text)
    .replace(/[ \t]+/g, " ")
    .replace(/\s*(?:-{3,}|—{3,})\s*/g, "\n\n---\n\n")
    .replace(/([^\n])\s+(#{1,4}\s+)/g, "$1\n\n$2")
    .replace(inlineHeadingTitleRegex, "$1\n\n")
    .replace(/([^\n])\s+([-*]\s+(?:话术|步骤|目的|诊断|对比|场景|兜底|建议|第一|第二|第三|第四|核心|下一步|引导|回复))/g, "$1\n\n$2")
    .replace(/([：:；;。！？])\s+(\d+[.、]\s+)/g, "$1\n$2")
    .replace(/([^\n])\s+(\d+[.、]\s+(?:这个|客户|先|再|最后|如果|目的|引导|话术|诊断|对比|场景|步骤|当前|核心|目标))/g, "$1\n$2")
    .replace(/([^\n])\s+(>\s*)/g, "$1\n$2")
    .replace(/(^|\n)([-*]\s+[^\n]+?)\s+(>\s*)/g, "$1$2\n$3")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n>\s*\n(\d+[.、]\s+)/g, "\n> $1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
}
