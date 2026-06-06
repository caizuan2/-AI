"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";
import { splitCustomerAnswerParagraphs } from "../lib/answer-format";

interface CustomerAnswerCardProps {
  content?: string | null;
}

export async function copyCustomerAnswerToClipboard(content: string, clipboard: Pick<Clipboard, "writeText">) {
  await clipboard.writeText(content);
}

export function CustomerAnswerCard({ content }: CustomerAnswerCardProps) {
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);
  const normalizedContent = content?.trim();
  const paragraphs = normalizedContent ? splitCustomerAnswerParagraphs(normalizedContent) : [];

  if (!normalizedContent) {
    return null;
  }

  async function handleCopy(value: string, key: string) {
    if (!normalizedContent || !navigator.clipboard) {
      return;
    }

    await copyCustomerAnswerToClipboard(value, navigator.clipboard);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1400);
  }

  return (
    <section className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-green-950">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-green-950">可直接复制给客户</h3>
          <p className="mt-1 text-xs text-green-700">已整理为适合对外沟通的简洁答案</p>
        </div>
        <button
          type="button"
          onClick={() => handleCopy(paragraphs.join("\n\n"), "all")}
          className="focus-ring inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full border border-green-300 bg-white px-3 text-xs font-semibold text-green-800 transition hover:bg-green-100"
        >
          {copiedKey === "all" ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
          {copiedKey === "all" ? "已复制" : "复制全部话术"}
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {paragraphs.map((paragraph, index) => {
          const key = `paragraph-${index}`;

          return (
            <div key={key} className="rounded-xl border border-green-100 bg-white/75 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-green-700">话术段落 {index + 1}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(paragraph, key)}
                  className="focus-ring inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2.5 text-xs font-semibold text-green-800 transition hover:bg-green-100"
                >
                  {copiedKey === key ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                  {copiedKey === key ? "已复制" : "复制本段"}
                </button>
              </div>
              <div className="text-sm leading-7 text-green-950">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                    ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
                    ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
                    li: ({ children }) => <li className="pl-1">{children}</li>,
                    strong: ({ children }) => <strong className="font-semibold">{children}</strong>
                  }}
                >
                  {paragraph}
                </ReactMarkdown>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
