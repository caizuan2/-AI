import type { ComponentType } from "react";
import { BotMessageSquare, CircleUserRound, Database, FileStack, ListChecks, Settings, ShieldCheck, Sparkles } from "lucide-react";
import type { IngestEXENavId, IngestEXENavItem } from "@/lib/enterprise/mock-ingest";

const navIcons: Record<IngestEXENavId, ComponentType<{ className?: string }>> = {
  feed: BotMessageSquare,
  knowledge: Database,
  files: FileStack,
  tasks: ListChecks,
  review: ShieldCheck,
  fix: Sparkles,
  settings: Settings
};

export function IngestEXESidebar({ items }: { items: IngestEXENavItem[] }) {
  return (
    <aside className="flex h-screen w-[68px] shrink-0 flex-col items-center border-r border-[#e7e7e4] bg-[#eeeeec] py-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white bg-[#d9f8e9] text-sm font-semibold text-[#128246] shadow-sm">
        AI
      </div>

      <nav className="mt-8 flex flex-1 flex-col items-center gap-3" aria-label="Admin ingest EXE navigation">
        {items.map((item) => {
          const Icon = navIcons[item.id];

          return (
            <button
              key={item.id}
              type="button"
              title={item.title}
              className="group relative flex w-[54px] flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-medium text-[#252525] transition hover:bg-white/80"
            >
              <span className={["relative flex h-8 w-8 items-center justify-center rounded-xl transition", item.active ? "bg-[#191919] text-white shadow-sm" : "text-[#222] group-hover:bg-white"].join(" ")}>
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.count ? <span className="absolute -right-1 -top-1 h-4 min-w-4 rounded-full bg-[#20b25b] px-1 text-[10px] leading-4 text-white">{item.count}</span> : null}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="flex flex-col items-center gap-3 text-[#333]">
        <button type="button" title="我的设置" className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-white">
          <CircleUserRound className="h-5 w-5" aria-hidden="true" />
        </button>
        <button type="button" title="系统设置" className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-white">
          <Settings className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
