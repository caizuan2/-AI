import type { ReactNode } from "react";
import { Building2, CircleUserRound, Sparkles } from "lucide-react";
import { teamOsNavigation } from "@/apps/team-os/utils/navigation";
import type { TeamOsUser } from "@/apps/team-os/types";

export function TeamOsShell({ children, user }: { children: ReactNode; user: TeamOsUser }) {
  return (
    <div className="min-h-dvh bg-slate-50 text-slate-950">
      <div className="flex min-h-dvh">
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-slate-950 px-4 py-6 text-white lg:flex lg:flex-col">
          <div className="flex items-center gap-3 px-2">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-500 shadow-lg shadow-indigo-950/30">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="font-semibold">AI Team OS</p>
              <p className="text-xs text-slate-400">智能运营系统</p>
            </div>
          </div>

          <nav className="mt-9 space-y-1" aria-label="AI Team OS 主导航">
            {teamOsNavigation.map((item, index) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  className={`flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium ${
                    index === 0 ? "bg-white/10 text-white" : "text-slate-400"
                  }`}
                  aria-current={index === 0 ? "page" : undefined}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </div>
              );
            })}
          </nav>

          <div className="mt-auto rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-xs text-slate-400">当前版本</p>
            <p className="mt-1 text-sm font-medium">Phase 0 · v0.1.0</p>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-7xl items-center gap-4">
              <div className="lg:hidden">
                <p className="font-semibold">AI Team OS</p>
                <p className="text-xs text-slate-500">智能运营系统</p>
              </div>
              <div className="ml-auto flex items-center gap-3 sm:gap-6">
                <div className="hidden items-center gap-2 text-sm text-slate-600 sm:flex">
                  <Building2 className="h-4 w-4" aria-hidden="true" />
                  <span>当前企业</span>
                  <span className="font-semibold text-slate-900">AI Team OS 演示企业</span>
                </div>
                <div className="h-7 w-px bg-slate-200" />
                <div className="flex items-center gap-2">
                  <CircleUserRound className="h-8 w-8 text-slate-500" aria-hidden="true" />
                  <div className="hidden sm:block">
                    <p className="text-sm font-medium text-slate-900">{user.name}</p>
                    <p className="max-w-48 truncate text-xs text-slate-500">{user.identity}</p>
                  </div>
                </div>
              </div>
            </div>
          </header>

          <main className="px-4 py-8 sm:px-6 lg:px-8">{children}</main>

          <nav className="fixed inset-x-0 bottom-0 grid grid-cols-4 border-t border-slate-200 bg-white px-2 pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="AI Team OS 移动导航">
            {teamOsNavigation.slice(0, 4).map((item, index) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs ${index === 0 ? "text-indigo-700" : "text-slate-500"}`}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </div>
              );
            })}
          </nav>
        </div>
      </div>
    </div>
  );
}
