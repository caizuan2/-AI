"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { IngestKnowledgeDraftCard } from "@/components/enterprise-admin/IngestKnowledgeDraftCard";
import { sanitizeGptOSUserMessage } from "@/lib/enterprise/gpt-os-fallback-normalizer";

const KNOWLEDGE_DRAFT_SUBTITLE = "以下为 GPT 根据当前资料生成的入库草稿参考，管理员可编辑确认后保存入库。";

const defaultNumberBadgeTone = {
  className: "bg-[#fff3df] text-[#a95400] ring-[#f1d6ab]",
  shadow: "inset 0 -2px 0 rgba(169,84,0,0.16), 0 8px 16px rgba(169,84,0,0.10)"
};

const numberBadgeTones = [
  defaultNumberBadgeTone,
  {
    className: "bg-[#eaf2ff] text-[#315bf6] ring-[#c9d8ff]",
    shadow: "inset 0 -2px 0 rgba(49,91,246,0.14), 0 8px 16px rgba(49,91,246,0.10)"
  },
  {
    className: "bg-[#e8f8ef] text-[#128246] ring-[#bee8cf]",
    shadow: "inset 0 -2px 0 rgba(18,130,70,0.14), 0 8px 16px rgba(18,130,70,0.10)"
  },
  {
    className: "bg-[#f3efff] text-[#6d4aff] ring-[#dacfff]",
    shadow: "inset 0 -2px 0 rgba(109,74,255,0.14), 0 8px 16px rgba(109,74,255,0.10)"
  }
];

export function IngestGPTMessageRenderer({ content }: { content: string }) {
  const safeContent = sanitizeGptOSUserMessage(content);
  const segments = safeContent.split(/```/g);

  return (
    <article className="w-full max-w-[860px] space-y-4 text-[15px] leading-[1.78] text-[#2f2f2f]">
      {segments.map((segment, index) => {
        const key = `${index}-${segment.slice(0, 12)}`;

        if (index % 2 === 1) {
          const code = segment.replace(/^\w+\n/, "").trim();

          return (
            <CopyableBlock key={key} copyText={code}>
              <pre className="overflow-x-auto whitespace-pre-wrap text-[13px] leading-6 text-[#303030]">
                <code>{code}</code>
              </pre>
            </CopyableBlock>
          );
        }

        return renderMarkdownBlock(segment, key);
      })}
    </article>
  );
}

function renderMarkdownBlock(segment: string, keyPrefix: string) {
  const lines = segment.split(/\n/g);
  const nodes: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    const key = `${keyPrefix}-${index}`;
    const heading = parseHeading(trimmed, lines, index);
    const knowledgeDraftTitle = parseKnowledgeDraftTitle(trimmed);

    if (!trimmed) {
      nodes.push(<div key={key} className="h-1" />);
      index += 1;
      continue;
    }

    if (knowledgeDraftTitle) {
      const { draftLines, nextIndex } = collectKnowledgeDraftLines(lines, index + 1);
      const { subtitle, bodyLines } = splitKnowledgeDraftIntro(draftLines);

      nodes.push(
        <IngestKnowledgeDraftCard
          key={key}
          title={knowledgeDraftTitle}
          subtitle={subtitle}
          body={bodyLines.join("\n")}
        />
      );
      index = nextIndex;
      continue;
    }

    if (isTableStart(lines, index)) {
      const tableLines: string[] = [];

      while (index < lines.length && lines[index]?.trim().startsWith("|")) {
        tableLines.push(lines[index] ?? "");
        index += 1;
      }

      nodes.push(<MarkdownTable key={key} lines={tableLines} />);
      continue;
    }

    if (trimmed.startsWith("---")) {
      nodes.push(<hr key={key} className="my-6 border-[#e7e7e4]" />);
      index += 1;
      continue;
    }

    if (heading) {
      nodes.push(<SectionHeading key={key} level={heading.level} text={heading.text} withRule={heading.withRule} />);
      index += 1;
      continue;
    }

    if (isFlowStart(lines, index)) {
      const { nextIndex, flowLines } = collectFlowLines(lines, index);
      const displayFlowLines = normalizeFlowLines(flowLines);
      index = nextIndex;

      nodes.push(
        <CopyableBlock key={key} copyText={displayFlowLines.join("\n")}>
          <div className="flex flex-col gap-2 text-[14px] leading-7 text-[#202020]" data-ingest-flow-block="true">
            {displayFlowLines.map((flowLine, flowIndex) => (
              <p
                key={`${key}-flow-${flowIndex}`}
                className={flowLine === "↓" ? "w-full text-center text-base font-semibold leading-6 text-[#6f6f68]" : isStrongSubtitleLine(flowLine) || isFlowLabel(flowLine) ? "font-semibold text-[#202020]" : "whitespace-pre-wrap"}
              >
                {renderLabeledInlineMarkdown(flowLine)}
              </p>
            ))}
          </div>
        </CopyableBlock>
      );
      continue;
    }

    if (isCalloutStart(lines, index)) {
      const { calloutLines, nextIndex } = collectCalloutLines(lines, index);
      index = nextIndex;

      nodes.push(
        <CopyableBlock key={key} copyText={calloutLines.join("\n")}>
          <div className="space-y-2 text-[14px] leading-7 text-[#202020]" data-ingest-callout-block="true">
            {calloutLines.map((calloutLine, calloutIndex) => (
              <p
                key={`${key}-callout-${calloutIndex}`}
                className={isStrongSubtitleLine(calloutLine) ? "font-semibold text-[#202020]" : "whitespace-pre-wrap"}
              >
                {renderLabeledInlineMarkdown(calloutLine)}
              </p>
            ))}
          </div>
        </CopyableBlock>
      );
      continue;
    }

    if (trimmed.startsWith("> ")) {
      const quoteLines: string[] = [];

      while (index < lines.length && (lines[index]?.trim().startsWith("> ") || !lines[index]?.trim())) {
        const quote = lines[index]?.trim() ?? "";

        if (quote.startsWith("> ")) {
          quoteLines.push(quote.slice(2));
        }

        index += 1;
      }

      nodes.push(
        <CopyableBlock key={key} copyText={quoteLines.join("\n")}>
          <div className="space-y-2 text-[14px] leading-7 text-[#202020]">
            {quoteLines.map((quote, quoteIndex) => (
              <p key={`${key}-quote-${quoteIndex}`} className="my-1.5 whitespace-pre-wrap">
                {renderInlineMarkdown(quote)}
              </p>
            ))}
          </div>
        </CopyableBlock>
      );
      continue;
    }

    const ordered = trimmed.match(/^(\d+)[.)]\s+(.+)/);

    if (ordered) {
      nodes.push(
        <div key={key} className="flex gap-3 pl-1">
          <NumberBadge value={ordered[1]} />
          <p className="min-w-0">{renderInlineMarkdown(ordered[2])}</p>
        </div>
      );
      index += 1;
      continue;
    }

    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      nodes.push(
        <div key={key} className="flex gap-3 pl-2">
          <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-[#777]" />
          <p className="min-w-0">{renderInlineMarkdown(trimmed.slice(2))}</p>
        </div>
      );
      index += 1;
      continue;
    }

    nodes.push(
      <p
        key={key}
        className={isStrongSubtitleLine(trimmed) ? "mt-3 mb-1 min-w-0 font-semibold text-[#202020]" : "min-w-0"}
      >
        {renderLabeledInlineMarkdown(trimmed)}
      </p>
    );
    index += 1;
  }

  return nodes;
}

function SectionHeading({
  level,
  text,
  withRule
}: {
  level: 1 | 2 | 3;
  text: string;
  withRule?: boolean;
}) {
  const className = level === 1
    ? "mt-8 text-[25px] font-bold leading-9 text-[#202020]"
    : level === 2
      ? "mt-6 text-[20px] font-semibold leading-8 text-[#202020]"
      : "mt-4 text-[17px] font-semibold leading-7 text-[#242424]";
  const HeadingTag = level === 1 ? "h2" : level === 2 ? "h3" : "h4";

  return (
    <div>
      <HeadingTag className={className}>{renderInlineMarkdown(text)}</HeadingTag>
      {withRule ? <div className="mt-3 h-px w-full bg-[#ecece9]" /> : null}
    </div>
  );
}

function NumberBadge({ value }: { value: string }) {
  const number = Number.parseInt(value, 10);
  const tone = numberBadgeTones[Number.isFinite(number) && number > 0 ? (number - 1) % numberBadgeTones.length : 0] ?? defaultNumberBadgeTone;

  return (
    <span
      className={["mt-1 flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full px-2 text-[12px] font-bold ring-1", tone.className].join(" ")}
      style={{ boxShadow: tone.shadow }}
    >
      {value}
    </span>
  );
}

function isTableStart(lines: string[], index: number) {
  const current = lines[index]?.trim() ?? "";
  const next = lines[index + 1]?.trim() ?? "";

  return current.startsWith("|") && next.startsWith("|") && /^[-:\s|]+$/.test(next);
}

function parseHeading(value: string, lines: string[] = [], index = 0): { level: 1 | 2 | 3; text: string; withRule?: boolean } | null {
  const markdown = value.match(/^(#{1,3})\s+(.+)$/);

  if (markdown) {
    const title = markdown[2].trim();
    const looksLikeMajorSection = /^[一二三四五六七八九十]+[、.．]\s*\S+/.test(title);
    const level = markdown[1].length === 1 || (markdown[1].length === 2 && looksLikeMajorSection) ? 1 : markdown[1].length === 2 ? 2 : 3;

    return { level, text: title, withRule: level === 1 };
  }

  if (/^[一二三四五六七八九十]+[、.．]\s*\S+/.test(value)) {
    return { level: 1, text: value, withRule: true };
  }

  const qHeading = value.match(/^(Q\d+)\s*[：:]\s*(.+)$/i);

  if (qHeading) {
    return { level: 3, text: `${qHeading[1]}：${qHeading[2].trim()}` };
  }

  const numbered = value.match(/^(\d+)[.．、]\s+(.+)$/);

  if (numbered && isNumericSectionHeading(numbered[2], lines, index)) {
    return { level: 2, text: value };
  }

  return null;
}

function isHeading(value: string) {
  return parseHeading(value) !== null;
}

function parseKnowledgeDraftTitle(value: string) {
  const normalized = value
    .replace(/^#{1,6}\s+/, "")
    .replace(/\*\*/g, "")
    .trim();

  if (normalized.length > 100) {
    return null;
  }

  if (/^(?:[一二三四五六七八九十]+[、.．]\s*)?(?:可入库草稿|入库草稿|知识库草稿|可保存知识)(?:[:：].*)?$/.test(normalized)) {
    return normalized;
  }

  if (/^[一二三四五六七八九十]+[、.．]\s*可入库草稿[:：]/.test(normalized)) {
    return normalized;
  }

  return null;
}

function collectKnowledgeDraftLines(lines: string[], startIndex: number) {
  const draftLines: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const current = lines[index] ?? "";
    const trimmed = current.trim();
    const hasDraftContent = draftLines.some((draftLine) => draftLine.trim());
    const heading = parseHeading(trimmed);

    if (hasDraftContent && heading?.level === 1 && isMajorChineseSectionTitle(heading.text) && !parseKnowledgeDraftTitle(trimmed)) {
      break;
    }

    draftLines.push(current);
    index += 1;
  }

  while (draftLines.length > 0 && !draftLines[0]?.trim()) {
    draftLines.shift();
  }

  while (draftLines.length > 0 && !draftLines[draftLines.length - 1]?.trim()) {
    draftLines.pop();
  }

  return {
    draftLines,
    nextIndex: index
  };
}

function splitKnowledgeDraftIntro(draftLines: string[]) {
  const lines = [...draftLines];
  const firstTextIndex = lines.findIndex((line) => Boolean(line.trim()));
  const fallbackSubtitle = KNOWLEDGE_DRAFT_SUBTITLE;

  if (firstTextIndex === -1) {
    return {
      subtitle: fallbackSubtitle,
      bodyLines: []
    };
  }

  const first = lines[firstTextIndex]?.trim() ?? "";
  const looksLikeIntro = first.length <= 80
    && !first.startsWith("|")
    && !/^[-*]\s+/.test(first)
    && !/^#{1,6}\s+/.test(first)
    && !/^[一二三四五六七八九十]+[、.．]\s*\S+/.test(first)
    && /下面|这份|草稿|复制|投喂版|第一批|结构化知识|根据当前资料|管理员可编辑/.test(first);

  if (!looksLikeIntro) {
    return {
      subtitle: fallbackSubtitle,
      bodyLines: lines
    };
  }

  lines.splice(firstTextIndex, 1);

  while (lines.length > 0 && !lines[0]?.trim()) {
    lines.shift();
  }

  return {
    subtitle: normalizeKnowledgeDraftSubtitle(first.replace(/^[-*]\s+/, "")),
    bodyLines: lines
  };
}

function normalizeKnowledgeDraftSubtitle(value: string) {
  const text = value.trim();

  if (!text || /复制到投喂版|下面这份|第一批|结构化知识草稿/.test(text)) {
    return KNOWLEDGE_DRAFT_SUBTITLE;
  }

  return text;
}

function isMajorChineseSectionTitle(value: string) {
  return /^[一二三四五六七八九十]+[、.．]\s*\S+/.test(value.trim());
}

function isNumericSectionHeading(text: string, lines: string[], index: number) {
  const body = text.replace(/\*\*/g, "").trim();
  const previous = lines[index - 1]?.trim() ?? "";
  const next = lines[index + 1]?.trim() ?? "";
  const hasSiblingListItem = /^(\d+)[.．、]\s+/.test(previous) || /^(\d+)[.．、]\s+/.test(next);

  return body.length <= 30 && !/[。；;，,]$/.test(body) && !body.includes("：") && !hasSiblingListItem;
}

function isFlowLabel(value: string) {
  return /^(流程|流程块|回答公式|建议话术|用户端调用公式|用户端调用策略|SOP|标准话术|优化成)[:：]/.test(value);
}

function isFlowStart(lines: string[], index: number) {
  const current = lines[index]?.trim() ?? "";
  const next = lines[index + 1]?.trim() ?? "";
  const nearby = lines.slice(index, index + 5).join("\n");

  if (isHeading(current)) {
    return false;
  }

  if (current && (next === "↓" || next.startsWith("↓"))) {
    return true;
  }

  return isFlowLabel(current) || current.includes("↓") || (nearby.trim().startsWith("↓") && !isHeading(next));
}

function collectFlowLines(lines: string[], startIndex: number) {
  const flowLines: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const current = lines[index]?.trim() ?? "";

    if (!current) {
      if (flowLines.length > 0) {
        const first = flowLines[0] ?? "";
        const nextNonEmpty = lines.slice(index + 1).find((line) => line.trim())?.trim() ?? "";

        if (flowLines.length === 1 && isFlowLabel(first) && nextNonEmpty && !isHeading(nextNonEmpty) && !isTableStart(lines, index + 1)) {
          index += 1;
          continue;
        }

        index += 1;
        break;
      }

      index += 1;
      continue;
    }

    if (flowLines.length > 0 && (isHeading(current) || isTableStart(lines, index))) {
      break;
    }

    flowLines.push(current);
    index += 1;

    const next = lines[index]?.trim() ?? "";

    if (flowLines.length > 1 && !current.includes("↓") && !next.includes("↓") && !isFlowLabel(current)) {
      break;
    }
  }

  return {
    flowLines: flowLines.length ? flowLines : [lines[startIndex]?.trim() ?? ""],
    nextIndex: index
  };
}

function normalizeFlowLines(lines: string[]) {
  const normalized: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    if (!trimmed.includes("↓") || trimmed === "↓") {
      normalized.push(trimmed);
      continue;
    }

    const labelMatch = trimmed.match(/^([^：:]{2,24}[：:])\s*(.+)$/);
    const body = labelMatch ? labelMatch[2] : trimmed;

    if (labelMatch) {
      normalized.push(labelMatch[1]);
    }

    const parts = body.split("↓").map((part) => part.trim()).filter(Boolean);

    parts.forEach((part, index) => {
      normalized.push(part);

      if (index < parts.length - 1) {
        normalized.push("↓");
      }
    });
  }

  return normalized;
}

function isCalloutLabel(value: string) {
  return /^(客户问|用户问|可以这样答|建议表达|优化成|售后处理话术|售后答疑|招商会转化话术|招商转化|合规提醒|风险提醒|第一批入库|第二批入库|下一步建议|用户端调用策略|回答公式|标准问答方向|保存优先级|分类建议|适用 Agent)[:：]/.test(value);
}

function isCardWorthyLine(value: string) {
  return /知识库检索\s*\+\s*GPT|GPT\s*二次思考|不承诺|不替代医疗|遵医嘱|如果明显不适|先不要慌|真正有说服力|案例因人而异|产品基础层|科学控体认知层|人群适配层|常见反应处理层|客户异议处理层|招商会转化层|合规风控层|第一批优先|第二批再入库|第三批可以继续|先共情客户问题|再解释科学逻辑|最后引导评估/.test(value);
}

function isCalloutStart(lines: string[], index: number) {
  const current = lines[index]?.trim() ?? "";

  if (!current || isHeading(current) || isTableStart(lines, index)) {
    return false;
  }

  return isCalloutLabel(current) || isCardWorthyLine(current);
}

function collectCalloutLines(lines: string[], startIndex: number) {
  const calloutLines: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const current = lines[index]?.trim() ?? "";

    if (!current) {
      index += 1;
      break;
    }

    if (calloutLines.length > 0 && (isHeading(current) || isTableStart(lines, index))) {
      break;
    }

    calloutLines.push(current);
    index += 1;

    if (calloutLines.length >= 6) {
      break;
    }

    const next = lines[index]?.trim() ?? "";

    if (calloutLines.length > 1 && next && !isCalloutLabel(next) && !isCardWorthyLine(next) && !/^[-*]\s+/.test(next)) {
      break;
    }
  }

  return {
    calloutLines,
    nextIndex: index
  };
}

function MarkdownTable({ lines }: { lines: string[] }) {
  const rows = lines
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"))
    .filter((line) => !/^[-:\s|]+$/.test(line))
    .map((line) => line.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()));
  const [headers, ...bodyRows] = rows;

  if (!headers?.length) {
    return null;
  }

  return (
    <div className="group relative my-5">
      <CopyButton copyText={lines.join("\n")} className="absolute right-2 top-2 z-10 opacity-100 sm:opacity-0 sm:group-hover:opacity-100" />
      <div className="overflow-x-auto rounded-2xl border border-[#dededb] bg-white shadow-[0_10px_30px_rgba(15,23,42,0.035)]">
        <table className="min-w-full border-separate border-spacing-0 text-left text-[13px]">
          <thead className="bg-[#f5f5f3] text-[#4b4b47]">
            <tr>
              {headers.map((header, index) => (
                <th
                  key={`${header}-${index}`}
                  className={[
                    "border-b border-[#e2e2df] px-4 py-3 font-semibold first:rounded-tl-2xl last:rounded-tr-2xl",
                    index === headers.length - 1 ? "pr-12" : ""
                  ].join(" ")}
                >
                  {renderInlineMarkdown(header)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-[#303030]">
            {bodyRows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`} className="even:bg-[#fafafa]">
                {headers.map((_, cellIndex) => (
                  <td key={`cell-${rowIndex}-${cellIndex}`} className="border-b border-[#eeeeeb] px-4 py-3 align-top leading-6 last:border-r-0">
                    {renderInlineMarkdown(row[cellIndex] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CopyableBlock({
  children,
  copyText
}: {
  children: ReactNode;
  copyText: string;
}) {
  return (
    <section className="group relative my-5 rounded-2xl border border-[#dededb] bg-[#f5f5f5] p-4 pr-12 text-[#202020] shadow-sm">
      <CopyButton copyText={copyText} className="absolute right-3 top-3" />
      {children}
    </section>
  );
}

function CopyButton({
  copyText,
  className = ""
}: {
  copyText: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(copyText);
    } catch {
      const textarea = document.createElement("textarea");

      textarea.value = copyText;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <span className={["inline-flex", className || "relative"].join(" ")}>
      <button
        type="button"
        onClick={() => void handleCopy()}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#e6e6e3] bg-white/95 text-[#666] shadow-sm transition hover:bg-[#eeeeeb] hover:text-[#202020]"
        aria-label={copied ? "已复制" : "复制内容"}
        title={copied ? "已复制" : "复制"}
      >
        {copied ? <Check className="h-3.5 w-3.5 text-[#128246]" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      </button>
      {copied ? (
        <span className="pointer-events-none absolute right-0 top-9 rounded-full bg-[#202020] px-2 py-1 text-[11px] font-semibold text-white shadow-lg">
          已复制
        </span>
      ) : null}
    </span>
  );
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${part}-${index}`} className="font-semibold text-[#202020]">{part.slice(2, -2)}</strong>;
    }

    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={`${part}-${index}`} className="rounded-md bg-[#ececea] px-1.5 py-0.5 text-xs text-[#303030]">{part.slice(1, -1)}</code>;
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function isStrongSubtitleLine(value: string) {
  return /^(核心定位|适用 Agent|用户端调用策略|回答公式|客户问|用户问|可以这样答|优化成|建议表达|合规提醒|第一批入库|第二批入库|下一步建议)[:：]/.test(value);
}

function renderLabeledInlineMarkdown(text: string) {
  const match = text.match(/^(核心定位|适用 Agent|用户端调用策略|回答公式|客户问|用户问|可以这样答|优化成|建议表达|合规提醒|第一批入库|第二批入库|下一步建议|流程|流程块|建议话术)[:：]\s*(.*)$/);

  if (!match) {
    return renderInlineMarkdown(text);
  }

  return (
    <>
      <strong className="font-semibold text-[#202020]">{match[1]}：</strong>
      {match[2] ? <span className="font-normal text-[#202020]"> {renderInlineMarkdown(match[2])}</span> : null}
    </>
  );
}
