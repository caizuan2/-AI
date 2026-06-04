"use client";

import { Copy, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CitationItem } from "@/components/product/citation-card";
import { cn } from "@/lib/utils";

function AnswerText({
  content
}: {
  content: string;
}) {
  return <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700 dark:text-slate-200">{content}</p>;
}

export function AnswerCard({
  answer,
  className
}: {
  answer: string;
  sources: CitationItem[];
  providerUsed?: string;
  modelUsed?: string;
  fallbackUsed?: boolean;
  cached?: boolean;
  latencyMs?: number;
  onCitationClick?: (index: number) => void;
  className?: string;
}) {
  async function copyAnswer() {
    await navigator.clipboard?.writeText(answer);
  }

  return (
    <section className={cn("rounded-lg border border-line bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-ink dark:text-slate-100">AI 回答</h2>
            <p className="text-xs text-muted dark:text-slate-400">自然业务答案，可直接使用。</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={copyAnswer}>
          <Copy className="h-4 w-4" />
          复制
        </Button>
      </div>

      <div className="mt-4">
        <AnswerText content={answer} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-xs text-muted dark:border-slate-700 dark:text-slate-400">
        <div className="flex gap-2">
          <Button variant="ghost" size="sm">
            <ThumbsUp className="h-4 w-4" />
            有帮助
          </Button>
          <Button variant="ghost" size="sm">
            <ThumbsDown className="h-4 w-4" />
            没帮助
          </Button>
        </div>
      </div>
    </section>
  );
}
