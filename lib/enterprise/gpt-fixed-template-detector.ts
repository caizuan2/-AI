import "server-only";

import { classifyGptOutputIntent, type GptOutputIntent } from "@/lib/enterprise/gpt-output-intent-classifier";

export const FIXED_TEMPLATE_TITLES = [
  "总体判断",
  "资料分层",
  "可入库草稿",
  "一线销售话术库",
  "售后答疑库",
  "招商会转化库",
  "用户端调用策略",
  "客户真实问题示例",
  "合规风控",
  "入库优先级",
  "下一步投喂建议"
];

function normalizeTitle(title: string) {
  return title.replace(/^[#\s一二三四五六七八九十\d、.．:-]+/, "").replace(/[：:]\s*.*$/, "").trim();
}

export function extractMarkdownSectionTitles(markdown: string) {
  return markdown
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /^#{1,4}\s+/.test(line) || /^[一二三四五六七八九十]+[、.．]\s*\S+/.test(line))
    .map(normalizeTitle)
    .filter(Boolean)
    .slice(0, 18);
}

function countFixedTitles(titles: string[]) {
  return titles.filter((title) => FIXED_TEMPLATE_TITLES.some((templateTitle) => title.includes(templateTitle))).length;
}

function intentAllowsKnowledgeTemplate(intent: GptOutputIntent) {
  return intent === "knowledge_draft" || intent === "user_client_call_plan";
}

export function detectFixedTemplateRisk(input: {
  userInput: string;
  replyMarkdown: string;
}) {
  const intent = classifyGptOutputIntent(input.userInput);
  const sectionTitles = extractMarkdownSectionTitles(input.replyMarkdown);
  const fixedTitleCount = countFixedTitles(sectionTitles);
  const hasOldFullTemplate = fixedTitleCount >= 5;
  const fixedTemplateRisk = hasOldFullTemplate && !intentAllowsKnowledgeTemplate(intent);

  return {
    intent,
    sectionTitles,
    fixedTitleCount,
    fixedTemplateRisk
  };
}
