import * as React from "react";
import { FileText, ShieldCheck } from "lucide-react";
import type { ChatSource, RagConfidence } from "../types";

interface SourceListProps {
  sources?: ChatSource[] | null;
  confidence?: RagConfidence | null;
}

const confidenceLabels: Record<RagConfidence, string> = {
  high: "高可信度",
  medium: "中可信度",
  low: "低可信度"
};

function formatScore(score: number) {
  if (!Number.isFinite(score)) {
    return "";
  }

  return `${Math.round(Math.max(0, Math.min(1, score)) * 100)}%`;
}

export function SourceList({ sources, confidence }: SourceListProps) {
  if ((!sources || sources.length === 0) && !confidence) {
    return null;
  }

  return (
    <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
      {confidence ? (
        <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          <span>RAG confidence：{confidenceLabels[confidence]}</span>
        </div>
      ) : null}

      {sources && sources.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">来源</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {sources.map((source) => (
              <div
                key={`${source.chunk_id}-${source.file_id ?? "knowledge"}`}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-blue-500" aria-hidden="true" />
                  <span className="min-w-0 truncate font-semibold text-slate-800">{source.title}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-slate-500">
                  <span className="truncate">chunk: {source.chunk_id}</span>
                  <span>{formatScore(source.score)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
