"use client";

import type { CitationItem } from "@/components/product/citation-card";
import { CitationCard } from "@/components/product/citation-card";
import { EmptyState } from "@/components/product/empty-state";

export function SourcePreviewPanel({
  sources,
  highlightedIndex,
  expandedIndexes,
  onToggle
}: {
  sources: CitationItem[];
  highlightedIndex?: number | null;
  expandedIndexes?: Set<number>;
  onToggle?: (index: number) => void;
}) {
  return (
    <aside className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-ink dark:text-slate-100">引用来源</h2>
        <p className="mt-1 text-sm text-muted dark:text-slate-400">回答中使用的知识片段、摘要和来源。</p>
      </div>
      {sources.length === 0 ? (
        <EmptyState title="暂无可引用知识" description="当问答命中知识库后，来源会显示在这里。" />
      ) : (
        sources.map((source) => (
          <CitationCard
            key={`${source.knowledgeItemId}-${source.chunkId}`}
            source={source}
            highlighted={highlightedIndex === source.citationIndex}
            expanded={expandedIndexes?.has(source.citationIndex)}
            onToggle={onToggle ? () => onToggle(source.citationIndex) : undefined}
          />
        ))
      )}
    </aside>
  );
}
