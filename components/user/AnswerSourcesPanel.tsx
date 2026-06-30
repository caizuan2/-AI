"use client";

import { BookOpen, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type AnswerSourceLike = {
  title?: string | null;
  content_preview?: string | null;
  snippet?: string | null;
  score?: number | null;
  relevance_score?: number | null;
};

function cleanText(value: unknown) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim()
    : "";
}

function formatScore(source: AnswerSourceLike) {
  const score = typeof source.relevance_score === "number"
    ? source.relevance_score
    : typeof source.score === "number"
      ? source.score
      : null;

  if (score === null || !Number.isFinite(score)) {
    return "";
  }

  return `${Math.round(Math.max(0, Math.min(1, score)) * 100)}%`;
}

export function AnswerSourcesPanel({
  sources,
  className
}: {
  sources?: AnswerSourceLike[] | null;
  className?: string;
}) {
  const visibleSources = (sources ?? [])
    .map((source) => ({
      title: cleanText(source.title) || "知识来源",
      snippet: cleanText(source.content_preview) || cleanText(source.snippet),
      score: formatScore(source)
    }))
    .slice(0, 5);

  if (visibleSources.length === 0) {
    return null;
  }

  return (
    <details className={cn("group rounded-2xl border border-slate-200 bg-white px-4 py-3", className)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-900">
        <span className="inline-flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-blue-600" aria-hidden="true" />
          引用来源
        </span>
        <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="mt-3 space-y-2">
        {visibleSources.map((source, index) => (
          <div key={`${source.title}-${index}`} className="rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold text-slate-800">{source.title}</p>
              {source.score ? <span className="shrink-0 text-slate-400">{source.score}</span> : null}
            </div>
            {source.snippet ? <p className="mt-1 line-clamp-2">{source.snippet}</p> : null}
          </div>
        ))}
      </div>
    </details>
  );
}
