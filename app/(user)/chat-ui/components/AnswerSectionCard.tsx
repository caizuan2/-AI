"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertTriangle,
  Check,
  ClipboardList,
  Copy,
  Lightbulb,
  MessageSquareQuote,
  Network,
  Route
} from "lucide-react";
import type { RichAnswerIcon } from "../lib/answer-format";

interface AnswerSectionCardProps {
  title: string;
  subtitle: string;
  content: string;
  icon: RichAnswerIcon;
}

const iconMap = {
  judge: ClipboardList,
  why: Lightbulb,
  steps: Route,
  logic: Network,
  notice: AlertTriangle,
  reply: MessageSquareQuote
} satisfies Record<RichAnswerIcon, typeof ClipboardList>;

export async function copyAnswerSectionToClipboard(content: string, clipboard: Pick<Clipboard, "writeText">) {
  await clipboard.writeText(content);
}

export function AnswerSectionCard({ title, subtitle, content, icon }: AnswerSectionCardProps) {
  const [copied, setCopied] = React.useState(false);
  const Icon = iconMap[icon];

  async function handleCopy() {
    if (!navigator.clipboard) {
      return;
    }

    await copyAnswerSectionToClipboard(content, navigator.clipboard);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <section className="space-y-3">
      <header className="flex min-w-0 items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-slate-950">{title}</h4>
          <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
        </div>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 text-sm leading-7 text-slate-700">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
                ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
                li: ({ children }) => <li className="pl-1">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>
              }}
            >
              {content}
            </ReactMarkdown>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="focus-ring inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
            {copied ? "已复制" : "复制"}
          </button>
        </div>
      </div>
    </section>
  );
}
