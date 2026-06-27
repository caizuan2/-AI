const lifecycleLabels: Record<string, string> = {
  new: "新知识",
  growing: "增长中",
  stable: "稳定",
  declining: "衰退",
  archive_candidate: "归档候选",
  unknown: "未知"
};

function totalOf(distribution?: Record<string, number>) {
  return Object.values(distribution ?? {}).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
}

export function IngestKnowledgeOSLifecyclePanel({ distribution }: { distribution?: Record<string, number> }) {
  const total = totalOf(distribution);
  const keys = ["new", "growing", "stable", "declining", "archive_candidate", "unknown"];

  return (
    <section className="rounded-3xl border border-[#ececea] bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.04)]">
      <h2 className="text-base font-semibold text-[#202020]">生命周期分布</h2>
      <p className="mt-1 text-sm text-[#7a7a74]">展示知识从新建、增长到稳定或衰退的状态。</p>
      {total === 0 ? (
        <p className="mt-5 rounded-2xl bg-[#f7f7f6] px-4 py-5 text-sm text-[#777]">暂无生命周期数据。</p>
      ) : (
        <div className="mt-5 space-y-4">
          {keys.map((key) => {
            const value = distribution?.[key] ?? 0;
            const percent = total > 0 ? Math.round((value / total) * 100) : 0;

            return (
              <div key={key}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-[#343431]">{lifecycleLabels[key] ?? key}</span>
                  <span className="text-[#777]">{value} · {percent}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#ececea]">
                  <div className="h-full rounded-full bg-[#202020]" style={{ width: `${percent}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
