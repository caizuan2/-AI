import * as React from "react";
import { FileText } from "lucide-react";
import { sanitizeVisibleSources } from "@/lib/ai-chat/visible-output-sanitizer";
import type { ChatSource, RagConfidence } from "../types";

interface SourceListProps {
  sources?: ChatSource[] | null;
  confidence?: RagConfidence | null;
}

export function SourceList({ sources, confidence: _confidence }: SourceListProps) {
  void _confidence;
  const visibleSources = sanitizeVisibleSources(sources ?? undefined);

  if (visibleSources.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">来源</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {visibleSources.map((source, index) => (
            <div
              key={`${source.title}-${index}`}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
            >
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 shrink-0 text-blue-500" aria-hidden="true" />
                <span className="min-w-0 truncate font-semibold text-slate-800">{source.title}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
