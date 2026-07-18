"use client";

import type { IngestAgentLearningState } from "@/lib/enterprise/ingest-memory-types";

export function IngestAgentLearningPanel({
  learning
}: {
  learning: IngestAgentLearningState | null;
}) {
  return (
    <section className="rounded-[22px] border border-[#e8e4dc] bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-[#27231d]">Agent 学习摘要</h2>
      {learning ? (
        <div className="mt-4 space-y-4">
          <div>
            <p className="text-xs font-semibold text-[#8a8378]">最近学到的主题</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {learning.learnedTopics.length ? learning.learnedTopics.map((topic) => (
                <span key={topic} className="rounded-full bg-[#f7f5ef] px-3 py-1 text-xs text-[#555049]">
                  {topic}
                </span>
              )) : <span className="text-sm text-[#8a8378]">暂无主题。</span>}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-[#8a8378]">偏好的回答方式</p>
            <p className="mt-2 text-sm leading-6 text-[#4f4a43]">{learning.preferredAnswerStyle || "保持自然短段落、结论优先。"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-[#8a8378]">风险边界</p>
            <ul className="mt-2 space-y-1 text-sm leading-6 text-[#4f4a43]">
              {(learning.riskBoundaries?.length ? learning.riskBoundaries : ["暂无明确风险边界。"]).map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </div>
          {learning.recentCorrections?.length ? (
            <div>
              <p className="text-xs font-semibold text-[#8a8378]">最近修正点</p>
              <ul className="mt-2 space-y-1 text-sm leading-6 text-[#4f4a43]">
                {learning.recentCorrections.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 rounded-2xl bg-[#f8f7f4] px-4 py-6 text-sm text-[#8a8378]">
          暂无 Agent 学习摘要。提取本轮记忆后会在这里沉淀学习轨迹。
        </p>
      )}
    </section>
  );
}
