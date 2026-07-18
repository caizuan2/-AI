"use client";

import type { IngestDraftMergePlan, IngestMemoryItem } from "@/lib/enterprise/ingest-memory-types";

const riskClass = {
  low: "bg-emerald-50 text-emerald-700 border-emerald-100",
  medium: "bg-amber-50 text-amber-700 border-amber-100",
  high: "bg-rose-50 text-rose-700 border-rose-100"
};

export function IngestMemoryDraftMergePanel({
  drafts,
  mergePlan,
  onGenerate
}: {
  drafts: IngestMemoryItem[];
  mergePlan: IngestDraftMergePlan | null;
  onGenerate: () => void;
}) {
  return (
    <section className="rounded-[22px] border border-[#e8e4dc] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#27231d]">待合并草稿</h2>
          <p className="mt-1 text-xs text-[#8a8378]">只生成合并建议，不会自动入库。</p>
        </div>
        <button
          type="button"
          onClick={onGenerate}
          className="rounded-full border border-[#d8d2c6] px-4 py-2 text-xs font-semibold text-[#3f3a34] transition hover:bg-[#f7f5ef]"
        >
          生成合并建议
        </button>
      </div>
      <div className="mt-4 space-y-2">
        {drafts.length ? drafts.slice(0, 4).map((draft) => (
          <div key={draft.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[#f8f7f4] px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#34302a]">{draft.title}</p>
              <p className="mt-0.5 truncate text-xs text-[#8a8378]">{draft.tags?.join(" / ") || draft.category || "训练记忆"}</p>
            </div>
            <span className="shrink-0 text-xs text-[#8a8378]">{Math.round(draft.confidence * 100)}%</span>
          </div>
        )) : (
          <div className="rounded-2xl bg-[#f8f7f4] px-4 py-6 text-sm text-[#8a8378]">
            暂无待合并草稿。完成几轮对话后可点击“提取本轮记忆”。
          </div>
        )}
      </div>
      {mergePlan ? (
        <div className="mt-4 rounded-2xl border border-[#ebe6db] bg-[#fffdf8] p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[#2f2a24]">{mergePlan.mergedTitle}</p>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${riskClass[mergePlan.duplicateRisk]}`}>
              {mergePlan.duplicateRisk === "high" ? "高重复" : mergePlan.duplicateRisk === "medium" ? "中重复" : "低重复"}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-[#625b52]">{mergePlan.reason}</p>
          <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-2xl bg-[#f7f5ef] p-3 text-xs leading-5 text-[#4b463f]">
            {mergePlan.mergedContent}
          </pre>
        </div>
      ) : null}
    </section>
  );
}
