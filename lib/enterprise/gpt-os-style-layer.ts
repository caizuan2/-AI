export type GptOSStyleSectionId = "conclusion" | "analysis" | "solution" | "steps" | "extra";

export interface GptOSStyleSection {
  id: GptOSStyleSectionId;
  title: string;
  content: string;
}

export interface GptOSParsedStyleOutput {
  markdown: string;
  summary: string;
  sections: GptOSStyleSection[];
  steps: string[];
  changed: boolean;
}

export interface GptOSStyleLayerResult {
  tone: "chatgpt_natural" | "chatgpt_structured";
  structure: "natural_markdown" | "gpt_os_expression_v2" | "gpt_os_expression_v31" | "gpt_os_renderer_v3";
  priority: "model_output_first" | "conclusion_first";
  output: string;
  changed: boolean;
  diagnostics: string[];
  summary: string;
  steps: string[];
  sections: GptOSStyleSection[];
}

export interface ProcessAIOutputContext {
  model?: string;
  source?: string;
  mode?: string;
  preserveCustomerBlock?: boolean;
}

export const OUTPUT_PRIORITY = [
  "model_output_first",
  "natural_markdown",
  "short_paragraphs",
  "customer_copy_block",
  "structured_metadata"
] as const;

export const STRUCTURED_DATA_POLICY = "structured data is metadata only; visible output stays natural ChatGPT-style Markdown";
export const GPT_OS_V31_POLICY = "GPT-OS output control keeps natural Markdown and never forces report templates";

const CUSTOMER_HEADING_PATTERN = /(可复制给客户|客户话术|复制给客户|标准回复)/;

function normalizeText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\u200b/g, "")
    .replace(/^```(?:json|markdown|md)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

function stripMarkdownLead(value: string) {
  return value
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/\*\*/g, "")
    .trim();
}

function splitIntoParagraphs(text: string) {
  return normalizeText(text)
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitSentences(value: string) {
  return stripMarkdownLead(value)
    .replace(/\s+/g, " ")
    .split(/(?<=[。！？!?；;])\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function trimLine(value: string, maxLength = 220) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).replace(/[，,。；;、\s]+$/, "")}...`;
}

function wrapSentencesNaturally(sentences: string[]) {
  const groups: string[] = [];
  let buffer = "";

  for (const sentence of sentences) {
    const needsSpace = /[A-Za-z0-9)]$/.test(buffer) && /^[A-Za-z0-9(]/.test(sentence);
    const candidate = buffer ? `${buffer}${needsSpace ? " " : ""}${sentence}` : sentence;

    if (buffer && candidate.length > 260) {
      groups.push(buffer);
      buffer = sentence;
    } else {
      buffer = candidate;
    }
  }

  if (buffer) {
    groups.push(buffer);
  }

  return groups.join("\n\n");
}

function normalizeHeadingText(title: string) {
  return title
    .replace(/^#{1,6}\s+/, "")
    .replace(/[：:]\s*$/, "")
    .trim();
}

function readTextFromPossibleJson(value: string) {
  const normalized = normalizeText(value);

  if (!/^\{[\s\S]*\}$/.test(normalized)) {
    return normalized;
  }

  try {
    const parsed = JSON.parse(normalized) as Record<string, unknown>;
    const candidates = [
      parsed.replyMarkdown,
      parsed.content,
      parsed.answer,
      parsed.reply,
      parsed.message
    ];

    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
  } catch {
    return normalized;
  }

  return normalized;
}

function normalizeMarkdownLine(line: string) {
  const trimmed = line.trim();

  if (!trimmed) {
    return "";
  }

  if (/^#{1,4}\s+/.test(trimmed)) {
    return trimmed.replace(/^#{1,6}\s+/, (prefix) => prefix.length > 4 ? "#### " : prefix);
  }

  if (/^[-*]\s+/.test(trimmed)) {
    return `- ${trimmed.replace(/^[-*]\s+/, "").trim()}`;
  }

  if (/^\d+[.)]\s+/.test(trimmed)) {
    const number = trimmed.match(/^(\d+)/)?.[1] ?? "1";

    return `${number}. ${trimmed.replace(/^\d+[.)]\s+/, "").trim()}`;
  }

  if (/^>\s+/.test(trimmed)) {
    return `> ${trimmed.replace(/^>\s+/, "").trim()}`;
  }

  return trimmed;
}

function softenLongParagraph(paragraph: string) {
  const trimmed = paragraph.trim();

  if (/^#{1,4}\s+/m.test(trimmed) || /^([-*]|\d+[.)]|>)\s+/m.test(trimmed) || trimmed.includes("```")) {
    return trimmed
      .split("\n")
      .map(normalizeMarkdownLine)
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  if (trimmed.length <= 420) {
    return trimmed;
  }

  return wrapSentencesNaturally(splitSentences(trimmed));
}

function cleanNaturalMarkdown(text: string) {
  const normalized = normalizeText(text);

  if (!normalized) {
    return "当前没有可展示的模型输出，请稍后重新生成。";
  }

  const paragraphs = splitIntoParagraphs(normalized);

  return paragraphs
    .map(softenLongParagraph)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getSectionId(title: string): GptOSStyleSectionId {
  const normalized = normalizeHeadingText(title).toLowerCase();

  if (/核心结论|判断|结论|summary|conclusion/.test(normalized)) {
    return "conclusion";
  }

  if (/关键分析|分析|原因|思路|analysis|reason/.test(normalized)) {
    return "analysis";
  }

  if (/建议动作|建议|方案|注意事项|solution|proposal/.test(normalized)) {
    return "solution";
  }

  if (/操作步骤|步骤|流程|step|process/.test(normalized)) {
    return "steps";
  }

  return "extra";
}

function parseRawSections(markdown: string) {
  const lines = normalizeText(markdown).split("\n");
  const sections: GptOSStyleSection[] = [];
  const intro: string[] = [];
  let current: GptOSStyleSection | null = null;

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,4}\s+(.+?)\s*$/);

    if (headingMatch) {
      if (current) {
        current.content = normalizeText(current.content);
        sections.push(current);
      }

      const title = normalizeHeadingText(headingMatch[1]);
      current = {
        id: getSectionId(title),
        title,
        content: ""
      };
      continue;
    }

    if (current) {
      current.content = `${current.content}${current.content ? "\n" : ""}${line}`;
    } else if (line.trim()) {
      intro.push(line);
    }
  }

  if (current) {
    current.content = normalizeText(current.content);
    sections.push(current);
  }

  return {
    intro: normalizeText(intro.join("\n")),
    sections
  };
}

function readSection(sections: GptOSStyleSection[], id: GptOSStyleSectionId) {
  return normalizeText(sections.find((section) => section.id === id)?.content ?? "");
}

function extractStepsFromText(value: string) {
  return normalizeText(value)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^(\d+[.)]|[-*])\s+/.test(line))
    .map((line) => line.replace(/^(\d+[.)]|[-*])\s+/, "").trim())
    .filter(Boolean);
}

function getSummary(markdown: string, sections: GptOSStyleSection[]) {
  const conclusion = readSection(sections, "conclusion");
  const source = conclusion || sections[0]?.content || markdown;
  const firstLine = normalizeText(source)
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !/^#{1,4}\s+/.test(line));

  return trimLine(firstLine ?? "已生成自然 Markdown 回复。", 220);
}

function isNaturalMarkdown(original: string, markdown: string) {
  return normalizeText(original) === normalizeText(markdown);
}

function normalizeProcessContext(context: string | ProcessAIOutputContext = "unknown"): Required<Pick<ProcessAIOutputContext, "model" | "source" | "mode">> & ProcessAIOutputContext {
  if (typeof context === "string") {
    return {
      model: context || "unknown",
      source: "legacy_string",
      mode: "default"
    };
  }

  return {
    ...context,
    model: context.model || "unknown",
    source: context.source || "unknown",
    mode: context.mode || "default"
  };
}

export function processAIOutput(output: string, context: string | ProcessAIOutputContext = "unknown"): GptOSStyleLayerResult {
  const processContext = normalizeProcessContext(context);
  const original = readTextFromPossibleJson(output);
  const markdown = cleanNaturalMarkdown(original);
  const parsed = parseRawSections(markdown);
  const summary = getSummary(markdown, parsed.sections);
  const steps = extractStepsFromText(markdown);
  const changed = !isNaturalMarkdown(original, markdown);
  const hasCustomerBlock = parsed.sections.some((section) => CUSTOMER_HEADING_PATTERN.test(section.title));

  return {
    tone: "chatgpt_natural",
    structure: "natural_markdown",
    priority: "model_output_first",
    output: markdown,
    changed,
    summary,
    sections: parsed.sections,
    steps,
    diagnostics: [
      "control:single_pipeline",
      "control:natural_markdown",
      `control:model:${processContext.model}`,
      `control:source:${processContext.source}`,
      `control:mode:${processContext.mode}`,
      `control:customer_block:${hasCustomerBlock ? "true" : "false"}`,
      "gptStyle:no_forced_schema:true",
      "gptStyle:no_report_template:true",
      `gptStyle:changed:${changed ? "true" : "false"}`,
      `gptStyle:sections:${parsed.sections.length}`,
      `gptStyle:steps:${steps.length}`
    ]
  };
}

export function transformToGPTStyle(output: string, context?: string | ProcessAIOutputContext): string {
  return processAIOutput(output, context ?? { source: "transformToGPTStyle" }).output;
}

export function parseGPTStyleOutput(output: string, context?: string | ProcessAIOutputContext): GptOSParsedStyleOutput {
  const processed = processAIOutput(output, context ?? { source: "parseGPTStyleOutput" });

  return {
    markdown: processed.output,
    summary: processed.summary,
    sections: processed.sections,
    steps: processed.steps,
    changed: processed.changed
  };
}

export function enhanceGPTStyle(output: string, context?: string | ProcessAIOutputContext): GptOSStyleLayerResult {
  return processAIOutput(output, context ?? { source: "enhanceGPTStyle" });
}

export function naturalLanguageFirst(output: string) {
  return enhanceGPTStyle(output, { source: "naturalLanguageFirst" }).output;
}

export function conversationalVersion(output: string) {
  return enhanceGPTStyle(output, { source: "conversationalVersion" }).output;
}

export class GPTOSRendererV3 {
  readonly version = "gpt_os_renderer_v3";

  formatStream(chunk: string) {
    return chunk.replace(/\r\n/g, "\n");
  }

  parseThinking(text: string) {
    const normalized = normalizeText(text);
    const thinkingPattern = /^(思考中|thinking|正在生成|正在分析|ai正在思考|模型正在思考)[：:\s-]*/i;
    const thinking = !normalized || thinkingPattern.test(normalized);
    const visibleText = normalized.replace(thinkingPattern, "").trim();

    return {
      thinking,
      label: thinking ? "AI正在思考..." : "正在生成回答...",
      visibleText
    };
  }

  splitSections(text: string) {
    return parseGPTStyleOutput(text, { source: "gpt_os_renderer_v3", mode: "split_sections" }).sections;
  }

  enhanceMarkdown(text: string) {
    return processAIOutput(text, { source: "gpt_os_renderer_v3", mode: "enhance_markdown" }).output;
  }

  createStreamingChunks(text: string, chunkSize = 8) {
    const normalized = this.formatStream(text);
    const safeChunkSize = Math.max(1, Math.floor(chunkSize));
    const chunks: string[] = [];

    for (let index = 0; index < normalized.length; index += safeChunkSize) {
      chunks.push(normalized.slice(index, index + safeChunkSize));
    }

    return chunks;
  }

  renderResult(text: string): GptOSStyleLayerResult {
    const result = enhanceGPTStyle(text, { source: "gpt_os_renderer_v3", mode: "render_result" });

    return {
      ...result,
      structure: this.version,
      diagnostics: [
        ...result.diagnostics,
        "gptStyle:renderer_v3",
        "gptStyle:natural_render:true",
        "gptStyle:stream_ready:true"
      ]
    };
  }
}
