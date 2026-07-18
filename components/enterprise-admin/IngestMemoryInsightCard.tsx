"use client";

import type { IngestMemoryItem } from "@/lib/enterprise/ingest-memory-types";

const typeLabel: Record<IngestMemoryItem["type"], string> = {
  fact: "事实",
  strategy: "策略",
  script: "话术",
  faq: "FAQ",
  sop: "SOP",
  risk: "风险",
  case: "案例",
  objection: "异议",
  training_note: "训练笔记",
  agent_preference: "偏好"
};

export function IngestMemoryInsightCard({
  item,
  onConfirm,
  onCopy
}: {
  item: IngestMemoryItem;
  onConfirm?: (id: string) => void;
  onCopy?: (item: IngestMemoryItem) => void;
}) {
  return (
    <article className="rounded-2xl border border-[#ece8de] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#f4efe5] px-2.5 py-1 text-[11px] font-semibold text-[#8b5e13]">
              {typeLabel[item.type]}
            </span>
            <span className="text-[11px] text-[#9a9388]">
              置信度 {Math.round(item.confidence * 100)}%
            </span>
          </div>
          <h3 className="mt-2 truncate text-sm font-semibold text-[#27231d]">{item.title}</h3>
        </div>
        <span className="shrink-0 rounded-full bg-[#f7f7f5] px-2.5 py-1 text-[11px] text-[#69645b]">
          {item.status}
        </span>
      </div>
      <p className="mt-3 line-clamp-4 text-sm leading-6 text-[#4f4a43]">{item.summary || item.content}</p>
      {item.tags?.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.tags.slice(0, 5).map((tag) => (
            <span key={tag} className="rounded-full bg-[#f7f7f5] px-2 py-0.5 text-[11px] text-[#777168]">
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onCopy?.(item)}
          className="rounded-full border border-[#e6e1d7] px-3 py-1.5 text-xs font-semibold text-[#4a453e] transition hover:bg-[#f7f5ef]"
        >
          复制记忆
        </button>
        <button
          type="button"
          onClick={() => onConfirm?.(item.id)}
          className="rounded-full bg-[#1f1f1f] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#b9b4aa]"
          disabled={item.status === "confirmed" || item.status === "saved"}
        >
          {item.status === "confirmed" || item.status === "saved" ? "已确认" : "标记确认"}
        </button>
      </div>
    </article>
  );
}
