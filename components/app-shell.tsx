"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Bell,
  BotMessageSquare,
  BookOpenCheck,
  Database,
  FolderOpen,
  Gauge,
  Home,
  MessageSquarePlus,
  MessageSquareWarning,
  PlugZap,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Tags,
  UploadCloud
} from "lucide-react";
import { AppBottomNavigation } from "@/components/product/app-bottom-navigation";
import { Sidebar, type SidebarItem } from "@/components/product/sidebar";
import { ThemeToggle } from "@/components/product/theme-toggle";

const baseNavItems: SidebarItem[] = [
  { href: "/", label: "分析首页", icon: BarChart3 },
  { href: "/chat", label: "AI 问答", icon: BotMessageSquare },
  { href: "/ingest", label: "对话投喂", icon: MessageSquarePlus },
  { href: "/upload", label: "文档管理", icon: UploadCloud },
  { href: "/sources", label: "数据源连接", icon: PlugZap },
  { href: "/knowledge", label: "知识库", icon: Database },
  { href: "/review", label: "知识复习", icon: BookOpenCheck },
  { href: "/tags", label: "标签管理", icon: Tags },
  { href: "/categories", label: "分类管理", icon: FolderOpen },
  { href: "/quick-actions", label: "快捷分类", icon: Sparkles },
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
    <div className="min-h-dvh bg-canvas text-ink dark:bg-slate-950 dark:text-slate-100">
      <div className="flex min-h-dvh">
        <Sidebar
          items={navItems}
          userName={user?.name ?? "未登录"}
          userIdentity={userIdentity}
          onLogout={handleLogout}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-line bg-white/85 px-4 py-3 backdrop-blur sm:px-6 lg:px-8 dark:border-slate-800 dark:bg-slate-950/85">
            <div className="flex items-center gap-3">
              <Link href="/" className="flex items-center gap-2 lg:hidden">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-ink text-white dark:bg-indigo-500">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <span className="text-sm font-semibold text-ink dark:text-slate-100">AI 知识库</span>
              </Link>

              <div className="hidden h-10 max-w-xl flex-1 items-center gap-2 rounded-lg border border-line bg-canvas px-3 text-sm text-muted md:flex dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                <Search className="h-4 w-4" />
                <span>搜索知识、问答、投喂记录</span>
              </div>

              <div className="ml-auto flex items-center gap-1">
                <ThemeToggle />
                <button
                  className="focus-ring grid h-10 w-10 place-items-center rounded-lg text-muted hover:bg-slate-100 hover:text-ink dark:hover:bg-slate-900 dark:hover:text-slate-100"
                  aria-label="通知"
                  title="通知"
                  type="button"
                >
                  <Bell className="h-4 w-4" />
                </button>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-8">{children}</main>
        </div>
      </div>
      <AppBottomNavigation
        items={[
          { href: "/", label: "首页", icon: Home },
          { href: "/chat", label: "问答", icon: BotMessageSquare },
          { href: "/ingest", label: "投喂", icon: MessageSquarePlus },
          { href: "/upload", label: "文档", icon: UploadCloud },
          { href: "/settings", label: "设置", icon: Settings }
        ]}
      />
    </div>
  );
}
