"use client";

export function IngestMemoryUsedPanel({
  assistantMessageId,
  usedMemoryIds,
  memoryParticipated,
  appliedPolicies,
  warnings
}: {
  assistantMessageId?: string;
  usedMemoryIds: string[];
  memoryParticipated?: boolean;
  appliedPolicies?: string[];
  warnings?: string[];
}) {
  return (
    <section className="rounded-[22px] border border-[#e8e4dc] bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-[#27231d]">本轮使用记忆</h2>
      <p className="mt-1 text-xs text-[#8a8378]">调试信息仅用于确认记忆是否参与生成。</p>
      <div className="mt-4 rounded-2xl bg-[#fbfaf7] p-4 text-sm text-[#5f584e]">
        <p>参与生成：<span className="font-semibold text-[#27231d]">{memoryParticipated ? "是" : "否"}</span></p>
        <p className="mt-2">Assistant Message：<span className="font-mono text-xs">{assistantMessageId || "暂无"}</span></p>
        <div className="mt-3">
          <p className="text-xs font-semibold text-[#8a8378]">usedMemoryIds</p>
          {usedMemoryIds.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {usedMemoryIds.map((id) => (
                <span key={id} className="rounded-full bg-white px-2 py-1 font-mono text-[11px] text-[#5f584e]">
                  {id}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-[#9a9286]">暂无使用记忆。</p>
          )}
        </div>
        {appliedPolicies?.length ? (
          <div className="mt-4">
            <p className="text-xs font-semibold text-[#8a8378]">Agent 学习策略</p>
            <ul className="mt-2 space-y-1 text-xs leading-5">
              {appliedPolicies.map((policy) => (
                <li key={policy}>- {policy}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {warnings?.length ? (
          <div className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {warnings.join(" / ")}
          </div>
        ) : null}
      </div>
    </section>
  );
}
