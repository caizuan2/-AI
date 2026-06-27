import type { AiChatMode, RagConfidence, RetrievedRagChunk } from "@/lib/rag/search";

export interface BuildCustomerAnswerInput {
  question: string;
  chunks: RetrievedRagChunk[];
  confidence: RagConfidence;
  mode: AiChatMode;
}

const CUSTOMER_NO_KNOWLEDGE_ANSWER = "您好，目前知识库中暂无该问题的明确资料，建议后续由人工进一步确认后回复。";
const INTERNAL_PATTERNS = [
  /chunk[_-]?id\s*[:：]?\s*[a-z0-9_-]+/gi,
  /storage[_-]?path\s*[:：]?\s*\S+/gi,
  /system\s+prompt/gi,
  /developer\s+instruction/gi,
  /系统提示词?/g,
  /开发者指令/g,
  /OPENAI_API_KEY/gi,
  /DATABASE_URL/gi
];

function normalizeWhitespace(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sanitizeCustomerAnswerText(value: string) {
  let text = normalizeWhitespace(value);

  for (const pattern of INTERNAL_PATTERNS) {
    text = text.replace(pattern, "");
  }

  return text
    .replace(/\s+([，。；：！？])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitFacts(content: string) {
  return sanitizeCustomerAnswerText(content)
    .split(/(?<=[。！？；;])|\n+/)
    .map((item) => item.replace(/^[-*•\d.、\s]+/, "").trim())
    .filter((item) => item.length >= 8)
    .filter((item) => !/^标准回答必须包含[:：]?$/.test(item))
    .filter((item) => !/provider|storage_path|系统提示|开发者指令|chunk_id/i.test(item));
}

function selectChunkFacts(chunks: RetrievedRagChunk[], maxFacts: number) {
  const seen = new Set<string>();
  const facts: string[] = [];

  for (const chunk of chunks) {
    for (const fact of splitFacts(chunk.content)) {
      const key = fact.replace(/\s+/g, "").slice(0, 80);

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      facts.push(fact.length > 140 ? `${fact.slice(0, 140)}...` : fact);

      if (facts.length >= maxFacts) {
        return facts;
      }
    }
  }

  return facts;
}

function normalizeQuestion(question: string) {
  const normalized = sanitizeCustomerAnswerText(question).replace(/[。！？!?]+$/g, "");

  return normalized.length > 42 ? `${normalized.slice(0, 42)}...` : normalized;
}

export function buildNoKnowledgeCustomerAnswer() {
  return CUSTOMER_NO_KNOWLEDGE_ANSWER;
}

export function buildCustomerAnswerFromText(question: string, answer: string) {
  const safeAnswer = sanitizeCustomerAnswerText(answer);

  if (!safeAnswer) {
    return buildNoKnowledgeCustomerAnswer();
  }

  return sanitizeCustomerAnswerText([
    `您好，关于「${normalizeQuestion(question)}」，可以这样理解：`,
    "",
    safeAnswer,
    "",
    "如果您还有更具体的使用场景或需求，也可以继续补充，我们会再协助您确认。"
  ].join("\n"));
}

export function buildCustomerAnswerFromChunks(input: BuildCustomerAnswerInput) {
  if (input.chunks.length === 0) {
    return buildNoKnowledgeCustomerAnswer();
  }

  const facts = selectChunkFacts(input.chunks, input.mode === "expert" ? 4 : 3);

  if (facts.length === 0) {
    return sanitizeCustomerAnswerText([
      `您好，关于「${normalizeQuestion(input.question)}」，目前资料中未看到明确说明。`,
      "",
      "建议由工作人员结合您的具体情况进一步确认后回复。"
    ].join("\n"));
  }

  const lines = [
    `您好，关于「${normalizeQuestion(input.question)}」，可以这样理解：`,
    "",
    ...facts.map((fact, index) => `${index + 1}. ${fact}`),
    "",
    input.confidence === "low"
      ? "目前资料中未明确提到的部分，建议由工作人员进一步确认。"
      : "如果您的情况涉及具体适用范围或特殊细节，建议再由工作人员进一步确认。",
    "",
    "您可以把具体需求补充给我们，我们会继续协助您确认。"
  ];

  return sanitizeCustomerAnswerText(lines.join("\n"));
}
