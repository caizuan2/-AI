const trendLabels: Record<string, { label: string; description: string }> = {
  fast_rising: { label: "近期上升", description: "近期命中或反馈快速增长。" },
  declining: { label: "趋势下降", description: "近期表现走弱，需要观察。" },
  evergreen: { label: "长期稳定", description: "长期稳定可复用知识。" },
  stale_high_score: { label: "高分但可能过期", description: "历史高分，近期可能需要复查。" },
  neutral: { label: "中性 / shadowMode", description: "数据不足或趋势中性。" },
  unknown: { label: "未知", description: "缺少趋势元数据。" }
};

function totalOf(distribution?: Record<string, number>) {
  return Object.values(distribution ?? {}).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
}

export function IngestKnowledgeOSTrendPanel({ distribution }: { distribution?: Record<string, number> }) {
  const total = totalOf(distribution);
  const keys = ["fast_rising", "declining", "evergreen", "stale_high_score", "neutral", "unknown"];

  return (
    <section className="rounded-3xl border border-[#ececea] bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.04)]">
      <h2 className="text-base font-semibold text-[#202020]">Trend 趋势分布</h2>
      <p className="mt-1 text-sm text-[#7a7a74]">展示知识近期增长、衰退和长期稳定信号。</p>
      {total === 0 ? (
        <p className="mt-5 rounded-2xl bg-[#f7f7f6] px-4 py-5 text-sm text-[#777]">暂无趋势数据。</p>
      ) : (
        <div className="mt-5 grid gap-3">
          {keys.map((key) => {
            const value = distribution?.[key] ?? 0;
            const percent = total > 0 ? Math.round((value / total) * 100) : 0;
            const copy = trendLabels[key] ?? { label: key, description: "" };

            return (
              <div key={key} className="rounded-2xl border border-[#efefed] bg-[#fbfbfa] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#202020]">{copy.label}</p>
                    <p className="mt-1 text-xs leading-5 text-[#7a7a74]">{copy.description}</p>
                  </div>
                  <span className="text-sm font-semibold text-[#202020]">{value}</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#ececea]">
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
