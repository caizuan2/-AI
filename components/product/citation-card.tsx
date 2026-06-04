"use client";

import Link from "next/link";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface CitationItem {
  citationIndex: number;
  chunkId: string;
  knowledgeItemId: string;
  title: string;
  summary: string;
  chunkText: string;
  category?: string;
  sourceType: string;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
  createdAt: string;
  similarity?: number;
  score?: number;
}

export function CitationCard({
  source,
  highlighted,
  expanded,
  onToggle
}: {
  source: CitationItem;
  highlighted?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  return (
    <article
      id={`source-card-${source.citationIndex}`}
      className={cn(
        "rounded-lg border bg-white p-4 transition dark:bg-slate-900",
        highlighted ? "border-indigo-300 shadow-sm dark:border-indigo-400" : "border-line hover:border-indigo-200 dark:border-slate-700"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-indigo-50 px-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200">
              [{source.citationIndex}]
            </span>
            <Link href={`/knowledge/${source.knowledgeItemId}`} className="focus-ring rounded text-sm font-semibold text-ink hover:text-indigo-700 dark:text-slate-100">
              {source.title}
            </Link>
          </div>
          <p className="mt-2 text-xs text-muted dark:text-slate-400">
            {source.sourceTitle ? `${source.sourceTitle} · ` : ""}
            {source.category ? `${source.category} · ` : ""}
            {source.sourceType} · {new Date(source.createdAt).toLocaleString("zh-CN")}
            {typeof source.similarity === "number" ? ` · ${Math.round(source.similarity * 100)}%` : ""}
            {typeof source.score === "number" ? ` · 综合分 ${Math.round(source.score * 100)}%` : ""}
          </p>
        </div>
        <Link href={`/knowledge/${source.knowledgeItemId}`} className="focus-ring rounded text-muted hover:text-indigo-700" aria-label="打开来源">
          <ExternalLink className="h-4 w-4" />
        </Link>
      </div>

      <p className="mt-3 line-clamp-3 text-xs leading-5 text-muted dark:text-slate-400">{source.summary}</p>
      <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50/70 px-3 py-2 dark:border-indigo-500/20 dark:bg-indigo-500/10">
        <p className="text-xs font-semibold text-indigo-900 dark:text-indigo-100">命中片段</p>
        <p className={cn("mt-1 text-xs leading-5 text-indigo-900 dark:text-indigo-100", expanded ? "whitespace-pre-wrap" : "line-clamp-4")}>
          {source.chunkText}
        </p>
      </div>
      {onToggle ? (
        <Button variant="ghost" size="sm" onClick={onToggle} className="mt-3 w-full">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {expanded ? "收起来源" : "展开来源"}
        </Button>
      ) : null}
    </article>
  );
}
