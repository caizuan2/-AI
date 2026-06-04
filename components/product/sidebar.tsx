"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { FileText, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SidebarItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

export function Sidebar({
  items,
  userName,
  userIdentity,
  onLogout
}: {
  items: SidebarItem[];
  userName: string;
  userIdentity: string;
  onLogout: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-72 shrink-0 flex-col border-r border-line bg-white/90 px-5 py-6 lg:flex dark:border-slate-800 dark:bg-slate-950/90">
      <Link href="/" className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-ink text-white shadow-soft dark:bg-indigo-500">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <span>
          <span className="block text-base font-semibold text-ink dark:text-slate-100">AI 知识库</span>
          <span className="block text-xs text-muted dark:text-slate-400">团队知识工作台</span>
        </span>
      </Link>

      <nav className="mt-9 space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "focus-ring flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition",
                active
                  ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200"
                  : "text-slate-600 hover:bg-slate-100 hover:text-ink dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-8 rounded-lg border border-line bg-canvas p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 text-sm font-medium text-ink dark:text-slate-100">
          <FileText className="h-4 w-4 text-indigo-700 dark:text-indigo-200" />
          本周知识健康度
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-2xl font-semibold text-ink dark:text-slate-100">86%</p>
            <p className="mt-1 text-xs text-muted dark:text-slate-400">可引用率</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-ink dark:text-slate-100">31</p>
            <p className="mt-1 text-xs text-muted dark:text-slate-400">新增片段</p>
          </div>
        </div>
      </div>

      <div className="mt-auto flex items-center gap-3 border-t border-line pt-5 dark:border-slate-800">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200">
          <UserRound className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink dark:text-slate-100">{userName}</p>
          <p className="truncate text-xs text-muted dark:text-slate-400">{userIdentity}</p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="focus-ring grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-slate-100 hover:text-ink dark:hover:bg-slate-900 dark:hover:text-slate-100"
          aria-label="退出登录"
          title="退出登录"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
