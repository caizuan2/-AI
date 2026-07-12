import type { ReactNode } from "react";
import { Building2, CircleUserRound, Sparkles } from "lucide-react";
import { TeamOsNavigation } from "@/apps/team-os/features/tasks/components/TeamOsNavigation";
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

          <TeamOsNavigation />

          <div className="mt-auto rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-xs text-slate-400">当前版本</p>
            <p className="mt-1 text-sm font-medium">Phase 4 · v0.6.0</p>
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
                  <span className="font-semibold text-slate-900">请在组织管理中选择</span>
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

          <main className="px-4 pb-24 pt-8 sm:px-6 lg:px-8 lg:pb-8">{children}</main>

          <TeamOsNavigation mobile />
        </div>
      </div>
    </div>
  );
}
