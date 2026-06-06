import type { ProviderStatus } from "../types";

export type RichAnswerIcon = "judge" | "why" | "steps" | "logic" | "notice" | "reply";

export interface RichAnswerSection {
  id: string;
  title: string;
  subtitle: string;
  content: string;
  icon: RichAnswerIcon;
}

interface BuildRichAnswerInput {
  answer: string;
  customerAnswer?: string | null;
  providerStatus?: ProviderStatus | null;
}

const INTERNAL_TEXT_PATTERNS = [
  /chunk[_-]?id\s*[:：]?\s*[a-z0-9_-]+/gi,
  /file[_-]?id\s*[:：]?\s*[a-z0-9_-]+/gi,
  /storage[_-]?path\s*[:：]?\s*\S+/gi,
  /RAG\s*confidence\s*[:：]?\s*\S*/gi,
  /系统提示词?/g,
  /开发者指令/g,
  /system\s+prompt/gi,
  /developer\s+instruction/gi
];

export function sanitizeDisplayText(value: string) {
  let text = value
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  for (const pattern of INTERNAL_TEXT_PATTERNS) {
    text = text.replace(pattern, "");
  }

  return text
    .replace(/\s+([，。；：！？])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitSentences(value: string) {
  return sanitizeDisplayText(value)
    .split(/(?<=[。！？；;])|\n+/)
    .map((item) => item.replace(/^[-*•\d.、\s]+/, "").trim())
    .filter(Boolean);
}

function firstUsefulLine(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const line = splitSentences(value ?? "")[0];

    if (line) {
      return line;
    }
  }

  return "当前问题可以先按知识库资料做保守、清晰的回复。";
}

function joinUsefulLines(values: string[], fallback: string, maxLines = 2) {
  const lines = values.filter(Boolean).slice(0, maxLines);

  return lines.length > 0 ? lines.join("\n") : fallback;
}

function hasNoKnowledgeStatus(status?: ProviderStatus | null) {
  return status === "no_relevant_knowledge";
}

export function buildRichAnswerSections(input: BuildRichAnswerInput): RichAnswerSection[] {
  const answer = sanitizeDisplayText(input.answer);
  const customerAnswer = sanitizeDisplayText(input.customerAnswer ?? "");
  const answerLines = splitSentences(answer);
  const customerLines = splitSentences(customerAnswer);
  const noKnowledge = hasNoKnowledgeStatus(input.providerStatus);

  if (noKnowledge) {
    return [
      {
        id: "core",
        title: "核心判断",
        subtitle: "先明确当前资料状态",
        content: "目前知识库中暂无该问题的明确资料，建议先不要给出确定性承诺。",
        icon: "judge"
      },
      {
        id: "next-step",
        title: "建议步骤",
        subtitle: "避免误答，先做人工确认",
        content: "可以先收集客户的具体情况，再由工作人员结合实际资料进一步确认后回复。",
        icon: "steps"
      }
    ];
  }

  return [
    {
      id: "core",
      title: "核心判断",
      subtitle: "先给用户一个直接结论",
      content: firstUsefulLine(answer, customerAnswer),
      icon: "judge"
    },
    {
      id: "why",
      title: "为什么",
      subtitle: "把依据换成更容易理解的表达",
      content: joinUsefulLines(
        answerLines.slice(1, 3),
        "这个回复基于当前知识库资料整理，重点是先讲清适用范围，再避免超出资料边界的承诺。"
      ),
      icon: "why"
    },
    {
      id: "how",
      title: "怎么做",
      subtitle: "把可执行动作说清楚",
      content: joinUsefulLines(
        customerLines.slice(0, 3),
        "建议先用简洁话术回应客户，再根据客户补充的信息继续确认细节。",
        3
      ),
      icon: "steps"
    },
    {
      id: "logic",
      title: "底层逻辑",
      subtitle: "说明回答背后的判断方式",
      content: "先使用已有资料中的确定信息，再把未明确说明的部分标记为需要进一步确认，避免把推测当成结论。",
      icon: "logic"
    },
    {
      id: "notice",
      title: "注意事项",
      subtitle: "对外沟通时保持边界",
      content: "如果客户问到资料中未明确覆盖的细节，不要直接承诺结果，可以引导客户补充场景后再确认。",
      icon: "notice"
    },
    {
      id: "reply",
      title: "建议回复方式",
      subtitle: "下方绿色区域可直接复制给客户",
      content: customerLines.length > 0
        ? "建议优先复制下方绿色话术，并按客户的具体情况删减或补充。"
        : "当前缺少可直接外发的话术，建议先由工作人员确认后再回复客户。",
      icon: "reply"
    }
  ];
}

function pushWithinLimit(result: string[], text: string, maxLength: number) {
  const normalized = sanitizeDisplayText(text);

  if (!normalized) {
    return;
  }

  if (normalized.length <= maxLength) {
    result.push(normalized);
    return;
  }

  for (let index = 0; index < normalized.length; index += maxLength) {
    const chunk = normalized.slice(index, index + maxLength).trim();

    if (chunk) {
      result.push(chunk);
    }
  }
}

export function splitCustomerAnswerParagraphs(content: string, maxLength = 100) {
  const result: string[] = [];
  const baseParagraphs = sanitizeDisplayText(content)
    .split(/\n+/)
    .map((item) => item.replace(/^[-*•\d.、\s]+/, "").trim())
    .filter(Boolean);

  for (const paragraph of baseParagraphs) {
    if (paragraph.length <= maxLength) {
      result.push(paragraph);
      continue;
    }

    const sentences = splitSentences(paragraph);
    let current = "";

    for (const sentence of sentences) {
      const next = current ? `${current}${sentence}` : sentence;

      if (next.length <= maxLength) {
        current = next;
        continue;
      }

      pushWithinLimit(result, current, maxLength);
      current = "";
      pushWithinLimit(result, sentence, maxLength);
    }

    pushWithinLimit(result, current, maxLength);
  }

  return result.length > 0 ? result : [sanitizeDisplayText(content)].filter(Boolean);
}
