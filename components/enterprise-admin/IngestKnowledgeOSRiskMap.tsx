type RiskMapInput = {
  highRiskChunks?: number;
  lowQualityChunks?: number;
  policyReviewRequiredCount?: number;
  lifecycleArchiveCandidateCount?: number;
  unknownMetadataCount?: number;
  decliningTrendCount?: number;
};

const riskCopy: Record<keyof RiskMapInput, { label: string; description: string; tone: string }> = {
  highRiskChunks: {
    label: "高风险知识",
    description: "Policy 标记为 high / critical 的知识。",
    tone: "border-rose-100 bg-rose-50 text-rose-700"
  },
  lowQualityChunks: {
    label: "低质量知识",
    description: "质量分低或反馈信号偏弱。",
    tone: "border-amber-100 bg-amber-50 text-amber-700"
  },
  policyReviewRequiredCount: {
    label: "需人工复核",
    description: "Policy 建议人工复查。",
    tone: "border-orange-100 bg-orange-50 text-orange-700"
  },
  lifecycleArchiveCandidateCount: {
    label: "归档候选",
    description: "仅建议人工复核，不自动归档。",
    tone: "border-purple-100 bg-purple-50 text-purple-700"
  },
  unknownMetadataCount: {
    label: "元数据未知",
    description: "旧数据使用 neutral fallback。",
    tone: "border-gray-100 bg-gray-50 text-gray-600"
  },
  decliningTrendCount: {
    label: "趋势下降",
    description: "近期表现走弱或命中下降。",
    tone: "border-sky-100 bg-sky-50 text-sky-700"
  }
};

export function IngestKnowledgeOSRiskMap({ risks }: { risks: RiskMapInput }) {
  const items = (Object.keys(riskCopy) as Array<keyof RiskMapInput>)
    .map((key) => ({
      key,
      value: risks[key] ?? 0,
      ...riskCopy[key]
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <section className="rounded-3xl border border-[#ececea] bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.04)]">
      <h2 className="text-base font-semibold text-[#202020]">风险地图</h2>
      <p className="mt-1 text-sm text-[#7a7a74]">只读展示风险信号，不执行删除、归档、合并动作。</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <div key={item.key} className={`rounded-2xl border p-4 ${item.tone}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{item.label}</p>
                <p className="mt-2 text-xs leading-5 opacity-80">{item.description}</p>
              </div>
              <span className="text-2xl font-semibold">{item.value}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
