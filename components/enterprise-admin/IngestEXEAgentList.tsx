import { FolderOpen, Plus, Search, SlidersHorizontal } from "lucide-react";
import type { IngestEXEAgent, IngestEXECollection, IngestEXETask } from "@/lib/enterprise/mock-ingest";

const toneClasses: Record<IngestEXEAgent["tone"], string> = {
  green: "bg-[#dff8e8] text-[#128246]",
  blue: "bg-[#e7f0ff] text-[#2d5fa8]",
  amber: "bg-[#fff3d6] text-[#9a6500]",
  rose: "bg-[#ffe8ea] text-[#b93b4a]",
  slate: "bg-[#eceff3] text-[#475569]"
};

export function IngestEXEAgentList({
  agents,
  collections,
  tasks
}: {
  agents: IngestEXEAgent[];
  collections: IngestEXECollection[];
  tasks: IngestEXETask[];
}) {
  return (
    <section className="hidden h-screen w-[300px] shrink-0 flex-col border-r border-[#ececea] bg-[#fafafa] md:flex">
      <div className="p-4 pb-3">
        <div className="flex h-10 items-center gap-2 rounded-2xl bg-[#f0f0ef] px-3 text-sm text-[#8a8a86]">
          <Search className="h-4 w-4" aria-hidden="true" />
          <span>搜索 Agent / 知识库</span>
        </div>
        <button type="button" className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-[#e4e4e1] bg-white text-sm font-medium text-[#202020] shadow-sm transition hover:bg-[#f7f7f5]">
          <Plus className="h-4 w-4" aria-hidden="true" />
          新建 Agent
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#999]">Knowledge Agent</div>
        <div className="space-y-1.5">
          {agents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              className={["w-full rounded-2xl p-3 text-left transition", agent.active ? "bg-[#e9e9e7]" : "hover:bg-[#f0f0ee]"].join(" ")}
            >
              <div className="flex gap-3">
                <span className={["flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold", toneClasses[agent.tone]].join(" ")}>{agent.avatar}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[#1f1f1f]">{agent.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-[#9a9a96]">{agent.role}</span>
                  <span className="mt-2 block line-clamp-2 text-xs leading-5 text-[#70706b]">{agent.description}</span>
                  <span className="mt-2 block text-[11px] font-medium text-[#128246]">{agent.stats}</span>
                </span>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-5 px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#999]">知识库 / 分类 / 训练</div>
        <div className="space-y-1.5">
          {collections.map((item) => (
            <button key={item.id} type="button" className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-[#f0f0ee]">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-[#555] shadow-sm">
                <FolderOpen className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-[#202020]">{item.name}</span>
                <span className="block truncate text-xs text-[#8c8c88]">{item.kind} · {item.count} · {item.status}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="mt-5 rounded-2xl border border-[#e7e7e4] bg-white p-3">
          <div className="flex items-center justify-between text-sm font-semibold text-[#202020]">
            <span>训练任务列表</span>
            <SlidersHorizontal className="h-4 w-4 text-[#8c8c88]" aria-hidden="true" />
          </div>
          <div className="mt-3 space-y-3">
            {tasks.map((task) => (
              <div key={task.id}>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-medium text-[#333]">{task.title}</span>
                  <span className="text-[#777]">{task.status}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-[#eeeeec]">
                  <div className="h-1.5 rounded-full bg-[#20b25b]" style={{ width: `${task.progress}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
