"use client";

import type { ReactNode } from "react";

export function IngestGPTMessageRenderer({ content }: { content: string }) {
  const segments = content.split(/```/g);

  return (
    <div className="space-y-4 text-[15px] leading-7 text-[#2f2f2f]">
      {segments.map((segment, index) => {
        const key = `${index}-${segment.slice(0, 12)}`;

        if (index % 2 === 1) {
          const code = segment.replace(/^\w+\n/, "").trim();

          return (
            <pre key={key} className="overflow-x-auto rounded-2xl bg-[#f2f2f0] px-4 py-3 text-[13px] leading-6 text-[#303030]">
              <code>{code}</code>
            </pre>
          );
        }

        return renderMarkdownBlock(segment, key);
      })}
    </div>
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

    if (trimmed.startsWith("### ")) {
      nodes.push(<h4 key={key} className="pt-2 text-base font-semibold text-[#202020]">{renderInlineMarkdown(trimmed.slice(4))}</h4>);
      index += 1;
      continue;
    }

    if (trimmed.startsWith("## ")) {
      nodes.push(<h3 key={key} className="pt-3 text-lg font-semibold text-[#202020]">{renderInlineMarkdown(trimmed.slice(3))}</h3>);
      index += 1;
      continue;
    }

    if (trimmed.startsWith("# ")) {
      nodes.push(<h2 key={key} className="pt-2 text-xl font-semibold text-[#202020]">{renderInlineMarkdown(trimmed.slice(2))}</h2>);
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
        <blockquote key={key} className="border-l-4 border-[#d7d7d3] bg-[#f7f7f5] px-4 py-2 text-[#4c4c49]">
          {quoteLines.map((quote, quoteIndex) => (
            <p key={`${key}-quote-${quoteIndex}`} className="my-1">{renderInlineMarkdown(quote)}</p>
          ))}
        </blockquote>
      );
      continue;
    }

    const ordered = trimmed.match(/^(\d+)[.)]\s+(.+)/);

    if (ordered) {
      nodes.push(
        <div key={key} className="flex gap-3">
          <span className="mt-0.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-[#f0f0ee] text-[12px] font-semibold text-[#6b6b67]">{ordered[1]}</span>
          <p className="min-w-0">{renderInlineMarkdown(ordered[2])}</p>
        </div>
      );
      index += 1;
      continue;
    }

    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      nodes.push(
        <div key={key} className="flex gap-3">
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

function isTableStart(lines: string[], index: number) {
  const current = lines[index]?.trim() ?? "";
  const next = lines[index + 1]?.trim() ?? "";

  return current.startsWith("|") && next.startsWith("|") && /^[-:\s|]+$/.test(next);
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
    <div className="overflow-x-auto rounded-2xl border border-[#e5e5e2] bg-white">
      <table className="min-w-full border-collapse text-left text-xs">
        <thead className="bg-[#f5f5f3] text-[#555]">
          <tr>
            {headers.map((header, index) => (
              <th key={`${header}-${index}`} className="border-b border-[#e5e5e2] px-3 py-2 font-semibold">{renderInlineMarkdown(header)}</th>
            ))}
          </tr>
        </thead>
        <tbody className="text-[#303030]">
          {bodyRows.map((row, rowIndex) => (
            <tr key={`row-${rowIndex}`} className="border-b border-[#f0f0ee] last:border-b-0">
              {headers.map((_, cellIndex) => (
                <td key={`cell-${rowIndex}-${cellIndex}`} className="px-3 py-2 align-top leading-5">{renderInlineMarkdown(row[cellIndex] ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
