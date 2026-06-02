"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  BotMessageSquare,
  BookOpenCheck,
  Database,
  FileText,
  FolderOpen,
  Gauge,
  Home,
  LogOut,
  MessageSquarePlus,
  MessageSquareWarning,
  Search,
  Settings,
  ShieldCheck,
  Tags,
  UploadCloud,
  UserRound
} from "lucide-react";
import { cn } from "@/lib/utils";

const baseNavItems = [
  { href: "/", label: "首页", icon: Home },
  { href: "/ingest", label: "对话投喂", icon: MessageSquarePlus },
  { href: "/upload", label: "文件投喂", icon: UploadCloud },
  { href: "/knowledge", label: "知识库", icon: Database },
  { href: "/review", label: "知识复习", icon: BookOpenCheck },
  { href: "/tags", label: "标签管理", icon: Tags },
  { href: "/categories", label: "分类管理", icon: FolderOpen },
  { href: "/chat", label: "知识问答", icon: BotMessageSquare },
  { href: "/feedback", label: "反馈", icon: MessageSquareWarning },
  { href: "/settings", label: "设置", icon: Settings }
];

interface AppShellUser {
  id: string;
  email: string | null;
  phone: string | null;
  name: string;
  isAdmin?: boolean;
}

export function AppShell({ children, user }: { children: ReactNode; user?: AppShellUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const navItems = user?.isAdmin
    ? [...baseNavItems, { href: "/admin", label: "管理后台", icon: Gauge }]
    : baseNavItems;
  const userIdentity = user ? user.phone || user.email || user.id : "点击进入登录";

  async function handleLogout() {
    if (!user) {
      router.push("/login");
      return;
    }

    await fetch("/api/auth/logout", {
      method: "POST"
    });

    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-dvh bg-canvas">
      <div className="flex min-h-dvh">
        <aside className="hidden w-72 shrink-0 flex-col border-r border-line bg-white/90 px-5 py-6 lg:flex">
          <Link href="/knowledge" className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-ink text-white shadow-soft">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-base font-semibold text-ink">AI 知识库</span>
              <span className="block text-xs text-muted">团队知识工作台</span>
            </span>
          </Link>

          <nav className="mt-9 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "focus-ring flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition",
                    active
                      ? "bg-teal-50 text-teal-700"
                      : "text-slate-600 hover:bg-slate-100 hover:text-ink"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-8 rounded-lg border border-line bg-canvas p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-ink">
              <FileText className="h-4 w-4 text-teal-700" />
              本周知识健康度
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-2xl font-semibold text-ink">86%</p>
                <p className="mt-1 text-xs text-muted">可引用率</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-ink">31</p>
                <p className="mt-1 text-xs text-muted">新增片段</p>
              </div>
            </div>
          </div>

          <div className="mt-auto flex items-center gap-3 border-t border-line pt-5">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-teal-100 text-teal-700">
              <UserRound className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{user?.name ?? "未登录"}</p>
              <p className="truncate text-xs text-muted">{userIdentity}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="focus-ring grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-slate-100 hover:text-ink"
              aria-label="退出登录"
              title="退出登录"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-line bg-white/85 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <Link href="/knowledge" className="flex items-center gap-2 lg:hidden">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-ink text-white">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <span className="text-sm font-semibold text-ink">AI 知识库</span>
              </Link>

              <div className="hidden h-10 max-w-md flex-1 items-center gap-2 rounded-lg border border-line bg-canvas px-3 text-sm text-muted md:flex">
                <Search className="h-4 w-4" />
                <span>搜索知识、问答、投喂记录</span>
              </div>

              <nav className="ml-auto flex items-center gap-1 lg:hidden">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active =
                    item.href === "/"
                      ? pathname === "/"
                      : pathname === item.href || pathname.startsWith(`${item.href}/`);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "focus-ring grid h-10 w-10 place-items-center rounded-lg",
                        active ? "bg-teal-50 text-teal-700" : "text-muted hover:bg-slate-100"
                      )}
                      aria-label={item.label}
                      title={item.label}
                    >
                      <Icon className="h-4 w-4" />
                    </Link>
                  );
                })}
              </nav>

              <button
                className="focus-ring ml-1 grid h-10 w-10 place-items-center rounded-lg text-muted hover:bg-slate-100 hover:text-ink"
                aria-label="通知"
                title="通知"
                type="button"
              >
                <Bell className="h-4 w-4" />
              </button>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
