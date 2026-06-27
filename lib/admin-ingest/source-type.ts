export const knowledgeSourceTypes = [
  "chat_input",
  "manual_note",
  "web_url",
  "document",
  "imported_text"
] as const;

export type KnowledgeSourceType = (typeof knowledgeSourceTypes)[number];

const knowledgeSourceTypeSet = new Set<string>(knowledgeSourceTypes);

export function normalizeKnowledgeSourceType(input: unknown, fallback: KnowledgeSourceType = "manual_note"): KnowledgeSourceType {
  const value = typeof input === "string" ? input.trim().toLowerCase() : "";
  const normalized = value.replace(/[\s-]+/g, "_");

  if (knowledgeSourceTypeSet.has(normalized)) {
    return normalized as KnowledgeSourceType;
  }

  if (normalized === "admin_chat" || normalized === "chat" || normalized === "conversation") {
    return "chat_input";
  }

  if (
    normalized === "admin_text" ||
    normalized === "text" ||
    normalized === "manual" ||
    normalized === "note" ||
    normalized === "admin_ingest"
  ) {
    return "manual_note";
  }

  if (normalized === "admin_url" || normalized === "url" || normalized === "web") {
    return "web_url";
  }

  if (
    normalized === "admin_file" ||
    normalized === "admin_image" ||
    normalized === "file" ||
    normalized === "pdf" ||
    normalized === "doc" ||
    normalized === "docx" ||
    normalized === "ppt" ||
    normalized === "pptx" ||
    normalized === "image"
  ) {
    return "document";
  }

  if (normalized === "import" || normalized === "imported") {
    return "imported_text";
  }

  return fallback;
}
