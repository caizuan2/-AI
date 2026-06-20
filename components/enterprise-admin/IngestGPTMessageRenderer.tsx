"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { IngestKnowledgeDraftCard } from "@/components/enterprise-admin/IngestKnowledgeDraftCard";

export function IngestGPTMessageRenderer({ content }: { content: string }) {
  const segments = content.split(/```/g);

  return (
    <article className="max-w-[840px] space-y-4 text-[15px] leading-[1.78] text-[#2f2f2f]">
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

      nodes.push(
        <IngestKnowledgeDraftCard
          key={key}
          title={knowledgeDraftTitle}
          body={draftLines.join("\n")}
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
      index = nextIndex;

      nodes.push(
        <CopyableBlock key={key} copyText={flowLines.join("\n")}>
          <div className="space-y-2 text-[14px] leading-7 text-[#333]">
            {flowLines.map((flowLine, flowIndex) => (
              <p
                key={`${key}-flow-${flowIndex}`}
                className={flowLine === "↓" ? "text-center text-[#9a9a94]" : isFlowLabel(flowLine) ? "font-semibold text-[#202020]" : "whitespace-pre-wrap"}
              >
                {renderInlineMarkdown(flowLine)}
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
          <div className="border-l-4 border-[#d4d4d0] pl-4 text-[#444]">
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
          <span className="mt-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-[#f0f0ee] text-[12px] font-semibold text-[#6b6b67]">{ordered[1]}</span>
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

    nodes.push(<p key={key} className="min-w-0">{renderInlineMarkdown(trimmed)}</p>);
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

    if (hasDraftContent && heading?.level === 1 && !parseKnowledgeDraftTitle(trimmed)) {
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
    draftLines: draftLines.length ? draftLines : ["这部分草稿内容仍在生成中，可先复制当前标题并继续让 GPT 补齐可入库问答。"],
    nextIndex: index
  };
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

  return isFlowLabel(current) || current.includes("↓") || (nearby.includes("↓") && !isHeading(next));
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
    <section className="group relative my-5 rounded-[22px] border border-[#eeeeeb] bg-[#f7f7f5] p-4 pr-12 shadow-[0_8px_26px_rgba(15,23,42,0.035)]">
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
