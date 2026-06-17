import { BookOpenCheck, FileText, Globe2, ImagePlus, ListChecks, Sparkles, Tags, UploadCloud } from "lucide-react";
import type { ComponentType } from "react";
import type { IngestEXETool } from "@/lib/enterprise/mock-ingest";

const toolIcons: Record<string, ComponentType<{ className?: string }>> = {
  chat: Sparkles,
  pdf: FileText,
  word: FileText,
  ppt: UploadCloud,
  image: ImagePlus,
  url: Globe2,
  tag: Tags,
  fix: BookOpenCheck
};

export function IngestEXETools({ tools }: { tools: IngestEXETool[] }) {
  return (
    <div className="rounded-[24px] border border-[#ececea] bg-white p-3 shadow-[0_12px_35px_rgba(15,23,42,0.05)]">
      <div className="mb-3 flex items-center justify-between px-1">
        <div>
          <h3 className="text-sm font-semibold text-[#202020]">投喂工具</h3>
          <p className="mt-0.5 text-xs text-[#8a8a86]">文档投喂 / 图片投喂 / 网址投喂 / AI 修正</p>
        </div>
        <ListChecks className="h-4 w-4 text-[#8a8a86]" aria-hidden="true" />
      </div>
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        {tools.map((tool) => {
          const Icon = toolIcons[tool.id] ?? Sparkles;

          return (
            <button
              key={tool.id}
              type="button"
              className={["flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-left transition", tool.active ? "border-[#202020] bg-[#202020] text-white" : "border-[#e7e7e4] bg-[#fafafa] text-[#333] hover:bg-white"].join(" ")}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold">{tool.label}</span>
                <span className={tool.active ? "block text-[10px] text-white/60" : "block text-[10px] text-[#999]"}>{tool.shortcut}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
