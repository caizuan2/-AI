export const knowledgeSourceTypes = [
  "chat_input",
  "manual_note",
  "web_url",
  "document",
  "imported_text"
] as const;

export type KnowledgeSourceType = (typeof knowledgeSourceTypes)[number];

export const defaultKnowledgeSourceType: KnowledgeSourceType = "manual_note";

export const knowledgeSourceTypeLabels: Record<KnowledgeSourceType, string> = {
  chat_input: "聊天输入",
  manual_note: "手动笔记",
  web_url: "网页 URL",
  document: "文档",
  imported_text: "导入文本"
};

export function isKnowledgeSourceType(value: unknown): value is KnowledgeSourceType {
  return typeof value === "string" && knowledgeSourceTypes.includes(value as KnowledgeSourceType);
}

export function getKnowledgeSourceTypeLabel(value: string) {
  return isKnowledgeSourceType(value) ? knowledgeSourceTypeLabels[value] : value;
}
