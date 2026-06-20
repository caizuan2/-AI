"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Check, Copy, Download, Maximize2, Pencil, X } from "lucide-react";

interface IngestKnowledgeDraftCardProps {
  title: string;
  subtitle?: string;
  body: string;
}

export function IngestKnowledgeDraftCard({
  title,
  subtitle = "下面这份可以直接复制到投喂版，作为第一批“结构化知识草稿”。",
  body
}: IngestKnowledgeDraftCardProps) {
  const initialDraft = useMemo(() => body.trim(), [body]);
  const [draftText, setDraftText] = useState(initialDraft);
  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const fullDraft = `${title}\n\n${subtitle}\n\n${draftText}`.trim();

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(fullDraft);
    } catch {
      const textarea = document.createElement("textarea");

      textarea.value = fullDraft;
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

  function handleDownload() {
    const blob = new Blob([fullDraft], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "knowledge-draft.md";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  const draftBody = (
    <div className="space-y-4">
      {isEditing ? (
        <textarea
          value={draftText}
          onChange={(event) => setDraftText(event.target.value)}
          rows={14}
          className="min-h-[320px] w-full resize-y rounded-2xl border border-[#dededb] bg-white px-4 py-3 text-sm leading-7 text-[#2f2f2f] outline-none transition focus:border-[#b8b8b2] focus:ring-4 focus:ring-[#eeeeeb]"
          data-draft-edit-textarea="true"
        />
      ) : (
        <DraftMarkdownPreview content={draftText} />
      )}
    </div>
  );

  return (
    <>
      <section
        className="group relative my-6 overflow-hidden rounded-[28px] border border-[#ddddda] bg-[#fbfbf8] shadow-[0_18px_55px_rgba(15,23,42,0.07)]"
        data-ingest-knowledge-draft-card="true"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#e8e8e4] bg-white/72 px-5 py-4">
          <button
            type="button"
            onClick={() => setIsEditing((current) => !current)}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-[#e7e7e3] bg-white px-3 text-xs font-semibold text-[#444] shadow-sm transition hover:bg-[#f3f3f1]"
            data-draft-edit-button="true"
          >
            {isEditing ? <Check className="h-3.5 w-3.5 text-[#128246]" aria-hidden="true" /> : <Pencil className="h-3.5 w-3.5" aria-hidden="true" />}
            {isEditing ? "保存编辑" : "编辑"}
          </button>
          <div className="relative flex shrink-0 items-center gap-1.5" data-draft-top-actions="true">
            <DraftIconButton label={copied ? "已复制" : "复制草稿"} onClick={() => void handleCopy()}>
              {copied ? <Check className="h-3.5 w-3.5 text-[#128246]" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
            </DraftIconButton>
            <DraftIconButton label="下载草稿" onClick={handleDownload}>
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
            </DraftIconButton>
            <DraftIconButton label="放大查看" onClick={() => setIsExpanded(true)}>
              <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
            </DraftIconButton>
            {copied ? (
              <span className="pointer-events-none absolute right-0 top-10 rounded-full bg-[#202020] px-2 py-1 text-[11px] font-semibold text-white shadow-lg">
                已复制
              </span>
            ) : null}
          </div>
        </div>

        <div className="px-5 pb-5 pt-4">
          <div className="mb-5">
            <p className="text-[11px] font-semibold uppercase text-[#8b8b86]">Knowledge Draft</p>
            <h3 className="mt-2 text-[22px] font-bold leading-8 text-[#202020]">{renderInlineMarkdown(title)}</h3>
            <p className="mt-2 text-sm leading-6 text-[#6b6b66]">{subtitle}</p>
          </div>
          {draftBody}
        </div>
      </section>

      {isExpanded ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-5" onClick={() => setIsExpanded(false)}>
          <section
            className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-[30px] border border-[#e3e3df] bg-white shadow-[0_30px_90px_rgba(15,23,42,0.28)]"
            onClick={(event) => event.stopPropagation()}
            data-draft-expanded-modal="true"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#eeeeeb] px-6 py-5">
              <div>
                <p className="text-[11px] font-semibold uppercase text-[#8b8b86]">Knowledge Draft</p>
                <h3 className="mt-2 text-[24px] font-bold leading-8 text-[#202020]">{renderInlineMarkdown(title)}</h3>
                <p className="mt-2 text-sm leading-6 text-[#777]">{subtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f5f5f3] text-[#555] transition hover:bg-[#ececea]"
                aria-label="关闭草稿预览"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-5">
              <DraftMarkdownPreview content={draftText} />
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function DraftIconButton({
  label,
  onClick,
  children
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#e7e7e3] bg-white text-[#555] shadow-sm transition hover:bg-[#f3f3f1] hover:text-[#202020]"
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function DraftMarkdownPreview({ content }: { content: string }) {
  const lines = content.split(/\n/g);
  const nodes: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    const key = `${index}-${trimmed.slice(0, 12)}`;

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

      nodes.push(<DraftTable key={key} lines={tableLines} />);
      continue;
    }

    if (/^[-*_]{3,}$/.test(trimmed)) {
      nodes.push(<div key={key} className="my-5 h-px bg-[#e7e7e3]" />);
      index += 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);

    if (heading) {
      const level = heading[1].length;
      const text = heading[2].trim();
      const className = level <= 2
        ? "mt-6 text-[18px] font-bold leading-7 text-[#202020]"
        : "mt-4 text-[15px] font-semibold leading-6 text-[#2f2f2f]";

      nodes.push(<h4 key={key} className={className}>{renderInlineMarkdown(text)}</h4>);
      index += 1;
      continue;
    }

    if (/^[一二三四五六七八九十]+[、.．]\s*\S+/.test(trimmed)) {
      nodes.push(<h4 key={key} className="mt-6 text-[18px] font-bold leading-7 text-[#202020]">{renderInlineMarkdown(trimmed)}</h4>);
      index += 1;
      continue;
    }

    const ordered = trimmed.match(/^(\d+)[.)]\s+(.+)/);

    if (ordered) {
      nodes.push(
        <div key={key} className="flex gap-3 pl-1">
          <span className="mt-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-white text-[12px] font-semibold text-[#666] shadow-sm">{ordered[1]}</span>
          <p className="min-w-0 leading-7 text-[#333]">{renderInlineMarkdown(ordered[2])}</p>
        </div>
      );
      index += 1;
      continue;
    }

    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      nodes.push(
        <div key={key} className="flex gap-3 pl-2">
          <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-[#777]" />
          <p className="min-w-0 leading-7 text-[#333]">{renderInlineMarkdown(trimmed.slice(2))}</p>
        </div>
      );
      index += 1;
      continue;
    }

    nodes.push(<p key={key} className="whitespace-pre-wrap leading-7 text-[#333]">{renderInlineMarkdown(trimmed)}</p>);
    index += 1;
  }

  return <div className="space-y-2 text-sm">{nodes}</div>;
}

function DraftTable({ lines }: { lines: string[] }) {
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
    <div className="my-4 overflow-x-auto rounded-2xl border border-[#dededb] bg-white">
      <table className="min-w-full border-separate border-spacing-0 text-left text-[13px]">
        <thead className="bg-[#f5f5f3] text-[#4b4b47]">
          <tr>
            {headers.map((header, index) => (
              <th key={`${header}-${index}`} className="border-b border-[#e2e2df] px-4 py-3 font-semibold">
                {renderInlineMarkdown(header)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-[#303030]">
          {bodyRows.map((row, rowIndex) => (
            <tr key={`row-${rowIndex}`} className="even:bg-[#fafafa]">
              {headers.map((_, cellIndex) => (
                <td key={`cell-${rowIndex}-${cellIndex}`} className="border-b border-[#eeeeeb] px-4 py-3 align-top leading-6">
                  {renderInlineMarkdown(row[cellIndex] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function isTableStart(lines: string[], index: number) {
  const current = lines[index]?.trim() ?? "";
  const next = lines[index + 1]?.trim() ?? "";

  return current.startsWith("|") && next.startsWith("|") && /^[-:\s|]+$/.test(next);
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
