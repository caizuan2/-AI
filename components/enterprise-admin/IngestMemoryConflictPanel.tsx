"use client";

import type { IngestMemoryConflictResult } from "@/lib/enterprise/ingest-memory-types";

const levelLabel: Record<IngestMemoryConflictResult["conflictLevel"], string> = {
  none: "无冲突",
  low: "低",
  medium: "中",
  high: "高"
};

export function IngestMemoryConflictPanel({
  result,
  isLoading,
  onDetect
}: {
  result: IngestMemoryConflictResult | null;
  isLoading?: boolean;
  onDetect: () => void;
}) {
  return (
    <section className="rounded-[22px] border border-[#e8e4dc] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#27231d]">冲突提醒</h2>
          <p className="mt-1 text-xs text-[#8a8378]">只提示，不自动覆盖旧记忆。</p>
        </div>
        <button
          type="button"
          onClick={onDetect}
          disabled={isLoading}
          className="rounded-full border border-[#e1dbcf] bg-[#fbfaf7] px-3 py-1.5 text-xs font-semibold text-[#4b463f] transition hover:bg-[#f5f0e7] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? "检测中" : "检测冲突"}
        </button>
      </div>

      <div className="mt-4 rounded-2xl bg-[#fbfaf7] p-4">
        <p className="text-sm text-[#5f584e]">
          冲突等级：<span className="font-semibold text-[#27231d]">{result ? levelLabel[result.conflictLevel] : "未检测"}</span>
        </p>
        {result?.conflicts.length ? (
          <div className="mt-3 space-y-2">
            {result.conflicts.map((conflict) => (
              <div key={`${conflict.memoryId}-${conflict.field}`} className="rounded-xl bg-white px-3 py-2 text-xs leading-5 text-[#5f584e]">
                <p className="font-semibold text-[#27231d]">{conflict.field}</p>
                <p>{conflict.reason}</p>
                <p className="mt-1 text-[#8a8378]">{conflict.suggestion}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-[#9a9286]">{result ? "当前未发现明显冲突。" : "选择草稿后可检测是否与已有训练记忆冲突。"}</p>
        )}
      </div>
    </section>
  );
}
