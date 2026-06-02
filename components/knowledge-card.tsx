import Link from "next/link";
import { ArrowUpRight, Clock3, Layers3 } from "lucide-react";
import { getKnowledgeQualityAverage, type KnowledgeQualityScores } from "@/lib/knowledge/quality";
import { StatusBadge } from "@/components/status-badge";
import type { KnowledgeStatus } from "@/types";

type KnowledgeCardItem = Partial<KnowledgeQualityScores> & {
  id: string;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  updatedAt: string;
  status?: KnowledgeStatus;
  importance?: number;
  chunkCount?: number;
};

export function KnowledgeCard({ item }: { item: KnowledgeCardItem }) {
  const hasQualityScores =
    typeof item.clarityScore === "number" &&
    typeof item.completenessScore === "number" &&
    typeof item.usefulnessScore === "number" &&
    typeof item.confidenceScore === "number";
  const qualityAverage = hasQualityScores
    ? getKnowledgeQualityAverage({
      clarityScore: item.clarityScore ?? 3,
      completenessScore: item.completenessScore ?? 3,
      usefulnessScore: item.usefulnessScore ?? 3,
      confidenceScore: item.confidenceScore ?? 3
    })
    : null;

  return (
    <Link
      href={`/knowledge/${item.id}`}
      className="focus-ring group flex h-full flex-col rounded-lg border border-line bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-100 hover:shadow-soft"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-medium text-muted">
            <Layers3 className="h-3.5 w-3.5" />
            {item.category}
          </p>
          <h2 className="mt-2 text-lg font-semibold text-ink">{item.title}</h2>
        </div>
        <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-muted transition group-hover:text-teal-700" />
      </div>

      <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted">{item.summary}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {item.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-xs text-muted">
        {item.status ? <StatusBadge status={item.status} /> : <span>重要度 {item.importance ?? 3}</span>}
        <span className="flex items-center gap-1.5">
          <Clock3 className="h-3.5 w-3.5" />
          {item.updatedAt}
        </span>
        {qualityAverage ? (
          <span>质量 {qualityAverage}/5</span>
        ) : (
          <span>{item.chunkCount ?? 0} 个片段</span>
        )}
      </div>
    </Link>
  );
}
