"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

export function IngestGPTMessageRenderer({ content }: { content: string }) {
  const segments = content.split(/```/g);

  return (
    <article className="max-w-[820px] space-y-5 text-[15px] leading-8 text-[#2f2f2f]">
      {segments.map((segment, index) => {
        const key = `${index}-${segment.slice(0, 12)}`;

        if (index % 2 === 1) {
          const code = segment.replace(/^\w+\n/, "").trim();

          return (
            <CopyableBlock key={key} copyText={code} label="代码 / 流程块">
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

    if (!trimmed) {
      nodes.push(<div key={key} className="h-1" />);
      index += 1;
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

    if (trimmed.startsWith("### ")) {
      nodes.push(<SectionHeading key={key} level={3} text={trimmed.slice(4)} />);
      index += 1;
      continue;
    }

    if (isFlowStart(lines, index)) {
      const flowLines: string[] = [];

      while (index < lines.length && lines[index]?.trim()) {
        const current = lines[index]?.trim() ?? "";

        if (flowLines.length > 0 && isHeading(current)) {
          break;
        }

        flowLines.push(current);
        index += 1;

        if (flowLines.length > 1 && !current.includes("↓") && !isFlowLabel(current)) {
          break;
        }
      }

      nodes.push(
        <CopyableBlock key={key} copyText={flowLines.join("\n")} label={isFlowLabel(flowLines[0] ?? "") ? flowLines[0] : "流程卡片"}>
          <div className="space-y-2 text-[14px] leading-7 text-[#333]">
            {flowLines.map((flowLine, flowIndex) => (
              <p key={`${key}-flow-${flowIndex}`} className={flowLine === "↓" ? "text-center text-[#9a9a94]" : "whitespace-pre-wrap"}>
                {renderInlineMarkdown(flowLine)}
              </p>
            ))}
          </div>
        </CopyableBlock>
      );
      continue;
    }

    if (trimmed.startsWith("## ")) {
      nodes.push(<SectionHeading key={key} level={2} text={trimmed.slice(3)} />);
      index += 1;
      continue;
    }

    if (trimmed.startsWith("# ")) {
      nodes.push(<SectionHeading key={key} level={1} text={trimmed.slice(2)} />);
      index += 1;
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
        <CopyableBlock key={key} copyText={quoteLines.join("\n")} label="建议话术">
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

function SectionHeading({ level, text }: { level: 1 | 2 | 3; text: string }) {
  const className = level === 1
    ? "pt-2 text-[23px] font-semibold leading-8 text-[#202020]"
    : level === 2
      ? "pt-4 text-[20px] font-semibold leading-8 text-[#202020]"
      : "pt-3 text-[17px] font-semibold leading-7 text-[#242424]";
  const HeadingTag = level === 1 ? "h2" : level === 2 ? "h3" : "h4";

  return (
    <div className="group flex items-start justify-between gap-3">
      <HeadingTag className={className}>{renderInlineMarkdown(text)}</HeadingTag>
      {isCopyableSectionTitle(text) ? (
        <CopyButton copyText={text} className="mt-3 opacity-100 sm:opacity-0 sm:group-hover:opacity-100" />
      ) : null}
    </div>
  );
}

function isTableStart(lines: string[], index: number) {
  const current = lines[index]?.trim() ?? "";
  const next = lines[index + 1]?.trim() ?? "";

  return current.startsWith("|") && next.startsWith("|") && /^[-:\s|]+$/.test(next);
}

function isHeading(value: string) {
  return /^#{1,3}\s+/.test(value);
}

function isFlowLabel(value: string) {
  return /^(流程|回答公式|建议话术|用户端调用公式|用户端调用策略|SOP|标准话术)[:：]/.test(value);
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

function isCopyableSectionTitle(value: string) {
  return /可入库|用户端|标准话术|SOP|回答风格|建议话术|流程|公式|草稿/.test(value);
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
    <CopyableBlock copyText={lines.join("\n")} label="表格">
      <div className="overflow-x-auto rounded-2xl border border-[#e2e2df] bg-white">
        <table className="min-w-full border-separate border-spacing-0 text-left text-[13px]">
          <thead className="bg-[#f5f5f3] text-[#4b4b47]">
            <tr>
              {headers.map((header, index) => (
                <th key={`${header}-${index}`} className="border-b border-[#e2e2df] px-4 py-3 font-semibold first:rounded-tl-2xl last:rounded-tr-2xl">
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
    </CopyableBlock>
  );
}

function CopyableBlock({
  children,
  copyText,
  label
}: {
  children: ReactNode;
  copyText: string;
  label: string;
}) {
  return (
    <section className="group relative rounded-[22px] border border-[#e6e6e3] bg-[#f7f7f5] p-4 shadow-[0_8px_26px_rgba(15,23,42,0.04)]">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[#777] shadow-sm">{label}</span>
        <CopyButton copyText={copyText} />
      </div>
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
    <button
      type="button"
      onClick={() => void handleCopy()}
      className={[
        "inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-white px-2.5 text-[11px] font-semibold text-[#666] shadow-sm transition hover:bg-[#eeeeeb] hover:text-[#202020]",
        className
      ].join(" ")}
    >
      {copied ? <Check className="h-3 w-3 text-[#128246]" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
      {copied ? "已复制" : "复制"}
    </button>
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
