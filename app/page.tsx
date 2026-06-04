import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BotMessageSquare, CircleHelp, Database, MessageSquareWarning } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { KnowledgeBaseCard } from "@/components/product/knowledge-base-card";
import { MetricCard } from "@/components/product/metric-card";
import { SystemStatusCard } from "@/components/system-status-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isAdminUser } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import { UnauthorizedError } from "@/lib/errors";
import { dashboardMetrics, knowledgeBaseCards, popularQuestions, unansweredQuestions } from "@/lib/mock/product-ui";

export const dynamic = "force-dynamic";

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
        <section className="rounded-lg border border-line bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <Badge>Analytics Dashboard</Badge>
              <h1 className="mt-4 text-2xl font-semibold text-ink sm:text-3xl dark:text-slate-100">
                AI 知识库分析首页
              </h1>
              <p className="mt-3 text-sm leading-6 text-muted sm:text-base dark:text-slate-400">
                查看知识资产规模、问答命中质量、未回答问题和低置信度风险，确保团队回答可追溯。
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/chat"
                className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500"
              >
                开始问答
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/upload"
                className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                上传文档
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {dashboardMetrics.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-5">
            <Card className="dark:border-slate-700 dark:bg-slate-900">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-indigo-700 dark:text-indigo-200" />
                  <CardTitle className="dark:text-slate-100">知识库概览</CardTitle>
                </div>
                <CardDescription className="dark:text-slate-400">文档数量、权限状态和索引状态。</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-3">
                {knowledgeBaseCards.map((item) => (
                  <KnowledgeBaseCard key={item.id} {...item} />
                ))}
              </CardContent>
            </Card>

            <Card className="dark:border-slate-700 dark:bg-slate-900">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <BotMessageSquare className="h-4 w-4 text-indigo-700 dark:text-indigo-200" />
                  <CardTitle className="dark:text-slate-100">热门问题</CardTitle>
                </div>
                <CardDescription className="dark:text-slate-400">最近被反复询问的问题和平均置信度。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {popularQuestions.map((item) => (
                  <article key={item.question} className="flex items-center justify-between gap-4 rounded-lg border border-line bg-canvas px-4 py-3 dark:border-slate-700 dark:bg-slate-950">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink dark:text-slate-100">{item.question}</p>
                      <p className="mt-1 text-xs text-muted dark:text-slate-400">{item.count} 次提问</p>
                    </div>
                    <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200">
                      {Math.round(item.confidence * 100)}%
                    </span>
                  </article>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-5">
            <SystemStatusCard />

            <Card className="dark:border-slate-700 dark:bg-slate-900">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <MessageSquareWarning className="h-4 w-4 text-rose-600 dark:text-rose-300" />
                  <CardTitle className="dark:text-slate-100">未回答问题</CardTitle>
                </div>
                <CardDescription className="dark:text-slate-400">需要补充知识或人工确认的高价值问题。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {unansweredQuestions.map((question) => (
                  <Link
                    key={question}
                    href={`/ingest?q=${encodeURIComponent(question)}`}
                    className="focus-ring flex items-center gap-3 rounded-lg border border-line bg-white px-4 py-3 text-sm text-ink hover:border-indigo-200 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
                  >
                    <CircleHelp className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-300" />
                    {question}
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
