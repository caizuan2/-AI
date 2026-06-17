import { CheckCircle2, ChevronDown, ClipboardCheck, FileSearch, PanelRightOpen, Sparkles } from "lucide-react";
import { IngestEXEInputBar } from "@/components/enterprise-admin/IngestEXEInputBar";
import { IngestTenantSummary } from "@/components/enterprise-admin/IngestTenantSummary";
import { IngestEXETools } from "@/components/enterprise-admin/IngestEXETools";
import type { IngestEXEGeneratedBlock, IngestEXEReviewItem, IngestEXETool } from "@/lib/enterprise/mock-ingest";

const blockTone: Record<IngestEXEGeneratedBlock["tone"], string> = {
  green: "border-[#cbeed8] bg-[#f3fcf6] text-[#128246]",
  blue: "border-[#d9e7ff] bg-[#f5f8ff] text-[#2d5fa8]",
  amber: "border-[#f5dfaa] bg-[#fffaf0] text-[#9a6500]",
  rose: "border-[#ffd6dc] bg-[#fff6f7] text-[#b93b4a]",
  slate: "border-[#e4e8ee] bg-[#f8fafc] text-[#475569]"
};

export function IngestEXEWorkspace({
  blocks,
  reviewItems,
  tools
}: {
  blocks: IngestEXEGeneratedBlock[];
  reviewItems: IngestEXEReviewItem[];
  tools: IngestEXETool[];
}) {
  return (
    <section className="flex h-screen min-w-0 flex-1 flex-col bg-white">
      <div className="flex h-10 items-center justify-between border-b border-[#eeeeeb] px-5 text-xs text-[#777]">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-3 font-medium text-[#555]">Admin Ingest EXE Workstation</span>
        </div>
        <div className="flex items-center gap-3">
          <IngestTenantSummary compact />
          <PanelRightOpen className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex rounded-2xl bg-[#f0f0ee] p-1 text-sm font-semibold text-[#555]">
            <button type="button" className="rounded-xl bg-white px-5 py-1.5 text-[#181818] shadow-sm">投喂任务</button>
            <button type="button" className="rounded-xl px-5 py-1.5 hover:text-[#181818]">知识生成</button>
            <button type="button" className="rounded-xl px-5 py-1.5 hover:text-[#181818]">审核队列</button>
          </div>
          <button type="button" className="flex items-center gap-2 rounded-2xl border border-[#e7e7e4] bg-white px-3 py-2 text-xs font-semibold text-[#333] shadow-sm hover:bg-[#fafafa]">
            默认知识库
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5">
          <div className="mx-auto max-w-5xl pt-8">
            <div className="text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] bg-[#dff8e8] text-3xl font-semibold text-[#128246] shadow-sm">知</div>
              <h1 className="mt-5 text-3xl font-semibold tracking-tight text-[#181818]">AI 知识生产工作站</h1>
              <p className="mt-2 text-base text-[#9a9a96]">把对话、文档、图片和网址加工成可审核、可保存、可引用的知识资产。</p>
              <div className="mx-auto mt-4 max-w-xl">
                <IngestTenantSummary />
              </div>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {blocks.map((block) => (
                <div key={block.id} className="rounded-[22px] border border-[#eeeeeb] bg-[#fbfbfa] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-[#202020]">{block.title}</h2>
                    <span className={["rounded-full border px-2 py-0.5 text-[11px] font-semibold", blockTone[block.tone]].join(" ")}>{block.status}</span>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-[#74746f]">{block.content}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="rounded-[26px] border border-[#ececea] bg-[#fbfbfa] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-[#202020]">任务式 AI 投喂画布</h2>
                    <p className="mt-1 text-sm text-[#858580]">不是聊天记录，而是从输入到提取、解析、审核、保存的任务流。</p>
                  </div>
                  <span className="rounded-full bg-[#202020] px-3 py-1 text-xs font-semibold text-white">运行中</span>
                </div>

                <div className="mt-5 grid gap-3">
                  <div className="rounded-[22px] border border-[#e8e8e5] bg-white p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#eeeeec] text-[#333]"><Sparkles className="h-4 w-4" aria-hidden="true" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-sm font-semibold text-[#202020]">AI 对话投喂</h3>
                          <span className="text-xs text-[#999]">Ctrl+Enter 执行</span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[#666]">输入原始材料后，系统会自动生成标题、摘要、分类标签、标准问答和保存建议。</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    {[
                      ["文档投喂", "PDF / Word / PPT 解析入口", FileSearch],
                      ["图片投喂", "OCR 入口占位", ClipboardCheck],
                      ["网址投喂", "网页内容提取入口", CheckCircle2]
                    ].map(([title, text, Icon]) => {
                      const TypedIcon = Icon as typeof FileSearch;
                      return (
                        <button key={title as string} type="button" className="rounded-[22px] border border-[#e8e8e5] bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
                          <TypedIcon className="h-5 w-5 text-[#128246]" aria-hidden="true" />
                          <h3 className="mt-3 text-sm font-semibold text-[#202020]">{title as string}</h3>
                          <p className="mt-1 text-xs leading-5 text-[#777]">{text as string}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <aside className="space-y-4">
                <div className="rounded-[24px] border border-[#ececea] bg-white p-4">
                  <h2 className="text-sm font-semibold text-[#202020]">审核任务</h2>
                  <div className="mt-3 space-y-3">
                    {reviewItems.map((item) => (
                      <div key={item.id} className="rounded-2xl bg-[#f8f8f7] p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium leading-5 text-[#242424]">{item.title}</p>
                          <span className="rounded-full bg-[#fff0d9] px-2 py-0.5 text-[11px] font-semibold text-[#9a6500]">{item.priority}</span>
                        </div>
                        <p className="mt-2 text-xs text-[#8a8a86]">{item.meta}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#d7f0df] bg-[#f5fcf7] p-4">
                  <h2 className="text-sm font-semibold text-[#128246]">AI 修正</h2>
                  <p className="mt-2 text-xs leading-5 text-[#4f735d]">检测到 3 条可优化知识，建议统一售后退款描述，补齐条件和来源。</p>
                  <button type="button" className="mt-3 rounded-2xl bg-[#128246] px-3 py-2 text-xs font-semibold text-white">打开修正建议</button>
                </div>
              </aside>
            </div>

            <div className="mt-5">
              <IngestEXETools tools={tools} />
            </div>
          </div>
        </div>
      </div>

      <IngestEXEInputBar />
    </section>
  );
}
