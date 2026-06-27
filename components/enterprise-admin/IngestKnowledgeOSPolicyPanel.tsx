const policyCopy: Record<string, { label: string; note: string; tone: string }> = {
  boost: {
    label: "Boost",
    note: "建议提高检索优先级。",
    tone: "border-emerald-100 bg-emerald-50 text-emerald-700"
  },
  keep: {
    label: "Keep",
    note: "保持当前权重。",
    tone: "border-sky-100 bg-sky-50 text-sky-700"
  },
  monitor: {
    label: "Monitor",
    note: "继续收集反馈。",
    tone: "border-gray-100 bg-gray-50 text-gray-600"
  },
  decay: {
    label: "Decay",
    note: "建议轻微降权。",
    tone: "border-amber-100 bg-amber-50 text-amber-700"
  },
  review_required: {
    label: "Review Required",
    note: "需要人工复核。",
    tone: "border-orange-100 bg-orange-50 text-orange-700"
  },
  merge_candidate: {
    label: "Merge Candidate",
    note: "仅建议人工合并，不自动合并。",
    tone: "border-purple-100 bg-purple-50 text-purple-700"
  },
  archive_candidate: {
    label: "Archive Candidate",
    note: "仅建议人工复核，不自动归档。",
    tone: "border-rose-100 bg-rose-50 text-rose-700"
  },
  blocked_auto_action: {
    label: "Blocked Auto Action",
    note: "自动动作被禁止。",
    tone: "border-red-100 bg-red-50 text-red-700"
  },
  unknown: {
    label: "Unknown",
    note: "数据不足。",
    tone: "border-gray-100 bg-gray-50 text-gray-600"
  }
};

export function IngestKnowledgeOSPolicyPanel({ distribution }: { distribution?: Record<string, number> }) {
  const keys = [
    "boost",
    "keep",
    "monitor",
    "decay",
    "review_required",
    "merge_candidate",
    "archive_candidate",
    "blocked_auto_action",
    "unknown"
  ];
  const hasData = keys.some((key) => (distribution?.[key] ?? 0) > 0);

  return (
    <section className="rounded-3xl border border-[#ececea] bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.04)]">
      <h2 className="text-base font-semibold text-[#202020]">Policy 风险分析</h2>
      <p className="mt-1 text-sm text-[#7a7a74]">Policy 只读展示，不自动合并、归档或禁用知识。</p>
      {!hasData ? (
        <p className="mt-5 rounded-2xl bg-[#f7f7f6] px-4 py-5 text-sm text-[#777]">暂无 Policy 风险数据。</p>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {keys.map((key) => {
            const copy = policyCopy[key];
            const value = distribution?.[key] ?? 0;
            const isImportant = key === "review_required" || key === "blocked_auto_action";

            return (
              <div key={key} className={`rounded-2xl border p-4 ${copy.tone} ${isImportant ? "ring-1 ring-current/20" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{copy.label}</p>
                    <p className="mt-2 text-xs leading-5 opacity-80">{copy.note}</p>
                  </div>
                  <span className="text-xl font-semibold">{value}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
