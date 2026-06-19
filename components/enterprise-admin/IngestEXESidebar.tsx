import type { ComponentType } from "react";
import { Bell, BotMessageSquare, Database, FileStack, ListChecks, Settings, ShieldCheck, Sparkles } from "lucide-react";
import { getIngestRailFeature } from "@/components/enterprise-admin/IngestRailConfig";
import type { IngestEXENavId, IngestEXENavItem } from "@/lib/enterprise/mock-ingest";

type IngestRailKey = "chat" | "experts" | "tasks" | "files" | "connections" | "memory" | "lab" | "notifications" | "settings";

const navIcons: Record<IngestEXENavId, ComponentType<{ className?: string }>> = {
  feed: BotMessageSquare,
  knowledge: Database,
  files: FileStack,
  tasks: ListChecks,
  review: ShieldCheck,
  fix: Sparkles,
  settings: Settings
};

const navKeyMap: Record<IngestEXENavId, IngestRailKey> = {
  feed: "chat",
  knowledge: "experts",
  files: "files",
  tasks: "tasks",
  review: "lab",
  fix: "lab",
  settings: "settings"
};

export function IngestEXESidebar({
  items,
  activeRailKey,
  adminAvatar = "",
  onRailChange
}: {
  items: IngestEXENavItem[];
  activeRailKey: IngestRailKey;
  adminAvatar?: string;
  onRailChange: (key: IngestRailKey) => void;
}) {
  return (
    <aside className="flex h-screen w-[68px] shrink-0 flex-col items-center border-r border-[#e7e7e4] bg-[#eeeeec] py-4">
      <button
        type="button"
        title="管理员头像 / 设置"
        onClick={() => onRailChange("settings")}
        className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white bg-gradient-to-br from-[#d9f8e9] to-[#fff7e8] text-sm font-semibold text-[#128246] shadow-sm transition hover:scale-[1.03] hover:shadow-md"
      >
        {adminAvatar ? (
          <span aria-label="管理员头像" className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${adminAvatar})` }} />
        ) : (
          "AI"
        )}
      </button>

      <nav className="mt-8 flex flex-1 flex-col items-center gap-3" aria-label="Admin ingest EXE navigation">
        {items.map((item) => {
          const railKey = navKeyMap[item.id];
          const feature = getIngestRailFeature(railKey);
          const Icon = feature?.icon ?? navIcons[item.id];
          const label = feature?.label ?? item.label;
          const title = feature?.title ?? item.title;
          const isDisabled = feature?.enabled === false;
          const isActive = !isDisabled && activeRailKey === railKey;

          return (
            <button
              key={item.id}
              type="button"
              title={isDisabled ? feature?.disabledHint ?? "该功能将由超级管理员后台开启。" : title}
              aria-disabled={isDisabled}
              onClick={() => {
                if (!isDisabled) {
                  onRailChange(railKey);
                }
              }}
              className={[
                "group relative flex w-[54px] flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-medium transition",
                isDisabled ? "cursor-not-allowed text-[#aaa]" : "hover:bg-white/80",
                isActive ? "text-[#128246]" : isDisabled ? "text-[#aaa]" : "text-[#252525]"
              ].join(" ")}
            >
              <span className={["relative flex h-8 w-8 items-center justify-center rounded-xl transition", isActive ? "bg-[#191919] text-white shadow-sm" : isDisabled ? "text-[#aaa]" : "text-[#222] group-hover:bg-white"].join(" ")}>
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.count && !isDisabled ? <span className="absolute -right-1 -top-1 h-4 min-w-4 rounded-full bg-[#20b25b] px-1 text-[10px] leading-4 text-white">{item.count}</span> : null}
              </span>
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="flex flex-col items-center gap-3 text-[#333]">
        <button type="button" title="投喂通知" onClick={() => onRailChange("notifications")} className={["flex h-9 w-9 items-center justify-center rounded-xl hover:bg-white", activeRailKey === "notifications" ? "bg-white text-[#128246]" : ""].join(" ")}>
          <Bell className="h-5 w-5" aria-hidden="true" />
        </button>
        <button type="button" title="当前投喂端设置" onClick={() => onRailChange("settings")} className={["flex h-9 w-9 items-center justify-center rounded-xl hover:bg-white", activeRailKey === "settings" ? "bg-white text-[#128246]" : ""].join(" ")}>
          <Settings className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
