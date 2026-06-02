import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BotMessageSquare, Database, FilePlus2, Sparkles, UploadCloud } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SystemStatusCard } from "@/components/system-status-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isAdminUser } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import { UnauthorizedError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const workflow = [
  {
    title: "聊天投喂",
    description: "通过对话框输入会议、工单或销售通话内容。",
    href: "/ingest",
    icon: FilePlus2
  },
  {
    title: "文件投喂",
    description: "上传 txt、md、pdf、docx 文件并自动提取文本。",
    href: "/upload",
    icon: UploadCloud
  },
  {
    title: "知识入库",
    description: "AI 整理标题、摘要、标签和分类，用户确认后入库。",
    href: "/knowledge",
    icon: Database
  },
  {
    title: "问答引用",
    description: "基于知识库生成回答，并展示可追溯来源。",
    href: "/chat",
    icon: BotMessageSquare
  }
];

export default async function HomePage() {
  let user: Awaited<ReturnType<typeof getCurrentUser>>;

  try {
    user = await getCurrentUser();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/login");
    }

    throw error;
  }

  if (!user.licenseActivated) {
    redirect("/unlock");
  }

  return (
    <AppShell user={{ ...user, isAdmin: isAdminUser(user) }}>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="rounded-lg border border-line bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="max-w-3xl">
              <Badge>MVP</Badge>
              <h1 className="mt-4 text-2xl font-semibold text-ink sm:text-3xl">
                对话式投喂型 AI 知识库
              </h1>
              <p className="mt-3 text-sm leading-6 text-muted sm:text-base">
                第一版先完成聊天投喂、AI 自动整理、确认入库、知识问答和引用来源的完整闭环。
              </p>
            </div>
            <Link
              href="/ingest"
              className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-white hover:bg-slate-800"
            >
              开始投喂
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {[
            { label: "投喂整理", value: "AI", hint: "自动生成标题、摘要、标签和分类" },
            { label: "知识入库", value: "DB", hint: "PostgreSQL + Prisma 持久化" },
            { label: "问答引用", value: "RAG", hint: "检索知识片段并展示来源" }
          ].map((metric) => (
            <Card key={metric.label}>
              <CardHeader>
                <CardDescription>{metric.label}</CardDescription>
                <CardTitle className="text-3xl">{metric.value}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted">{metric.hint}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-4">
          {workflow.map((item) => {
            const Icon = item.icon;

            return (
              <Link key={item.href} href={item.href} className="focus-ring group rounded-lg">
                <Card className="h-full transition group-hover:-translate-y-0.5 group-hover:border-teal-100 group-hover:shadow-soft">
                  <CardHeader>
                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-teal-50 text-teal-700">
                      <Icon className="h-5 w-5" />
                    </span>
                    <CardTitle className="pt-2">{item.title}</CardTitle>
                    <CardDescription>{item.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <span className="inline-flex items-center gap-2 text-sm font-medium text-teal-700">
                      进入页面
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </section>

        <SystemStatusCard />

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-teal-700" />
              <CardTitle>当前版本边界</CardTitle>
            </div>
            <CardDescription>
              当前版本已接入真实 API、Prisma、PostgreSQL 和 pgvector；本地开发可使用 fallback，生产环境必须配置真实 OpenAI key。
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </AppShell>
  );
}
