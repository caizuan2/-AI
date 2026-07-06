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

export function normalizeUserChatMarkdown(value: string) {
  let text = value
    .replace(/\r\n/g, "\n")
    .replace(/\u200b/g, "")
    .trim();

  if (!text) {
    return "";
  }

  text = text
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
