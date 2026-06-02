"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  Database,
  FileUp,
  Loader2,
  RefreshCw,
  Search,
  Users,
  Wallet,
  MessageCircleQuestion
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { unwrapApiResponse } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type AnalyticsPoint = {
  date: string;
  dailyActiveUsers: number;
  newKnowledgeCount: number;
  questionCount: number;
  averageRetrievalHitCount: number | null;
  aiCallCount: number;
  aiEstimatedCostUsd: number;
  aiTotalTokens: number;
  uploadFileCount: number;
};

type AdminAnalyticsResponse = {
  range: {
    days: number;
    startDate: string;
    endDate: string;
  };
  summary: {
    dailyActiveUsersToday: number;
    newKnowledgeTotal: number;
    questionTotal: number;
    averageRetrievalHitCount: number | null;
    aiCallTotal: number;
    aiEstimatedCostUsd: number;
    aiTotalTokens: number;
    uploadFileTotal: number;
    retentionRate: number | null;
  };
  retention: {
    previousActiveUsers: number;
    currentActiveUsers: number;
    retainedUsers: number;
    rate: number | null;
  };
  series: AnalyticsPoint[];
  empty: boolean;
};

type Metric = {
  title: string;
  value: string;
  description: string;
  icon: typeof Users;
};

function formatCount(value: number) {
  return value.toLocaleString("zh-CN");
}

function formatPercent(value: number | null) {
  return value === null ? "-" : `${Math.round(value * 100)}%`;
}

function formatUsd(value: number) {
  if (value === 0) {
    return "$0";
  }

  if (value < 0.01) {
    return `$${value.toFixed(6)}`;
  }

  return `$${value.toFixed(2)}`;
}

function formatDateLabel(value: string) {
  return new Date(value).toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric"
  });
}

function getMaxValue(points: AnalyticsPoint[], getValue: (point: AnalyticsPoint) => number) {
  return Math.max(1, ...points.map(getValue));
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-line bg-white px-4 py-14 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-slate-100 text-muted">
        <Database className="h-5 w-5" />
      </div>
      <p className="mt-4 text-sm font-semibold text-ink">暂无运营数据</p>
      <p className="mt-2 text-sm leading-6 text-muted">
        当用户开始投喂知识、上传文件、检索问答或触发 AI 调用后，这里会显示聚合指标。
      </p>
    </div>
  );
}

function MetricCard({ title, value, description, icon: Icon }: Metric) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardDescription>{title}</CardDescription>
          <CardTitle className="mt-2 text-2xl">{value}</CardTitle>
        </div>
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-teal-50 text-teal-700">
          <Icon className="h-5 w-5" />
        </span>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted">{description}</p>
      </CardContent>
    </Card>
  );
}

function BarChart({
  title,
  description,
  points,
  getValue,
  valueLabel,
  accent = "bg-teal-600"
}: {
  title: string;
  description: string;
  points: AnalyticsPoint[];
  getValue: (point: AnalyticsPoint) => number;
  valueLabel: (value: number) => string;
  accent?: string;
}) {
  const maxValue = getMaxValue(points, getValue);
  const hasValues = points.some((point) => getValue(point) > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {!hasValues ? (
          <div className="rounded-lg border border-dashed border-line bg-canvas px-4 py-10 text-center text-sm text-muted">
            暂无数据
          </div>
        ) : (
          <div className="flex h-56 items-end gap-2">
            {points.map((point) => {
              const value = getValue(point);
              const height = Math.max(6, Math.round((value / maxValue) * 180));

              return (
                <div key={point.date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                  <div className="flex h-[180px] w-full items-end justify-center">
                    <div
                      className={cn("w-full max-w-8 rounded-t-md transition", accent, value === 0 ? "opacity-20" : "opacity-90")}
                      style={{ height }}
                      title={`${formatDateLabel(point.date)} · ${valueLabel(value)}`}
                    />
                  </div>
                  <span className="w-full truncate text-center text-[11px] text-muted">{formatDateLabel(point.date)}</span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DualBarChart({ points }: { points: AnalyticsPoint[] }) {
  const maxValue = getMaxValue(points, (point) => Math.max(point.newKnowledgeCount, point.questionCount));
  const hasValues = points.some((point) => point.newKnowledgeCount > 0 || point.questionCount > 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>知识与问答</CardTitle>
          <CardDescription>新增知识数与问答次数对照。</CardDescription>
        </div>
        <div className="flex gap-2">
          <Badge variant="default">知识</Badge>
          <Badge variant="warning">问答</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {!hasValues ? (
          <div className="rounded-lg border border-dashed border-line bg-canvas px-4 py-10 text-center text-sm text-muted">
            暂无数据
          </div>
        ) : (
          <div className="flex h-56 items-end gap-2">
            {points.map((point) => {
              const knowledgeHeight = Math.max(6, Math.round((point.newKnowledgeCount / maxValue) * 180));
              const questionHeight = Math.max(6, Math.round((point.questionCount / maxValue) * 180));

              return (
                <div key={point.date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                  <div className="flex h-[180px] w-full items-end justify-center gap-1">
                    <div
                      className={cn("w-3 rounded-t-md bg-teal-600", point.newKnowledgeCount === 0 ? "opacity-20" : "opacity-90")}
                      style={{ height: knowledgeHeight }}
                      title={`${formatDateLabel(point.date)} · 知识 ${point.newKnowledgeCount}`}
                    />
                    <div
                      className={cn("w-3 rounded-t-md bg-amber-500", point.questionCount === 0 ? "opacity-20" : "opacity-90")}
                      style={{ height: questionHeight }}
                      title={`${formatDateLabel(point.date)} · 问答 ${point.questionCount}`}
                    />
                  </div>
                  <span className="w-full truncate text-center text-[11px] text-muted">{formatDateLabel(point.date)}</span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RetentionPanel({ analytics }: { analytics: AdminAnalyticsResponse }) {
  const rate = analytics.retention.rate;
  const percentage = rate === null ? 0 : Math.max(0, Math.min(100, Math.round(rate * 100)));

  return (
    <Card>
      <CardHeader>
        <CardTitle>用户留存粗略统计</CardTitle>
        <CardDescription>最近 14 天内，上周活跃用户在最近 7 天再次活跃的比例。</CardDescription>
      </CardHeader>
      <CardContent>
        {analytics.retention.previousActiveUsers === 0 ? (
          <div className="rounded-lg border border-dashed border-line bg-canvas px-4 py-10 text-center text-sm text-muted">
            暂无可计算留存的数据
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-3xl font-semibold text-ink">{formatPercent(rate)}</p>
                  <p className="mt-1 text-sm text-muted">粗略留存率</p>
                </div>
                <Badge variant={percentage >= 50 ? "default" : "warning"}>
                  {analytics.retention.retainedUsers}/{analytics.retention.previousActiveUsers}
                </Badge>
              </div>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-teal-600" style={{ width: `${percentage}%` }} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-line bg-canvas p-4">
                <p className="text-xl font-semibold text-ink">{formatCount(analytics.retention.previousActiveUsers)}</p>
                <p className="mt-1 text-xs text-muted">上周活跃</p>
              </div>
              <div className="rounded-lg border border-line bg-canvas p-4">
                <p className="text-xl font-semibold text-ink">{formatCount(analytics.retention.currentActiveUsers)}</p>
                <p className="mt-1 text-xs text-muted">本周活跃</p>
              </div>
              <div className="rounded-lg border border-line bg-canvas p-4">
                <p className="text-xl font-semibold text-ink">{formatCount(analytics.retention.retainedUsers)}</p>
                <p className="mt-1 text-xs text-muted">持续活跃</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminAnalyticsDashboard() {
  const [analytics, setAnalytics] = useState<AdminAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const metrics = useMemo<Metric[]>(() => {
    if (!analytics) {
      return [];
    }

    return [
      {
        title: "日活用户",
        value: formatCount(analytics.summary.dailyActiveUsersToday),
        description: "今天有过知识、问答、反馈或统计事件的用户。",
        icon: Users
      },
      {
        title: "新增知识数",
        value: formatCount(analytics.summary.newKnowledgeTotal),
        description: `${analytics.range.days} 天内创建的知识记录。`,
        icon: Database
      },
      {
        title: "问答次数",
        value: formatCount(analytics.summary.questionTotal),
        description: `${analytics.range.days} 天内的知识库问答请求。`,
        icon: MessageCircleQuestion
      },
      {
        title: "平均检索命中",
        value: analytics.summary.averageRetrievalHitCount === null ? "-" : analytics.summary.averageRetrievalHitCount.toFixed(2),
        description: "每次 RAG 检索返回的平均来源数。",
        icon: Search
      },
      {
        title: "AI 成本估算",
        value: formatUsd(analytics.summary.aiEstimatedCostUsd),
        description: `${formatCount(analytics.summary.aiCallTotal)} 次调用，约 ${formatCount(analytics.summary.aiTotalTokens)} tokens。`,
        icon: Wallet
      },
      {
        title: "上传文件数量",
        value: formatCount(analytics.summary.uploadFileTotal),
        description: `${analytics.range.days} 天内成功解析的上传文件。`,
        icon: FileUp
      },
      {
        title: "用户留存",
        value: formatPercent(analytics.summary.retentionRate),
        description: "上周活跃并在本周继续活跃的粗略比例。",
        icon: Bot
      }
    ];
  }, [analytics]);

  async function loadAnalytics(options?: { refresh?: boolean }) {
    if (options?.refresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const response = await fetch("/api/admin/analytics?days=14");
      const data = await unwrapApiResponse<AdminAnalyticsResponse>(response, "加载运营数据失败。");

      setAnalytics(data);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "加载运营数据失败。");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadAnalytics();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin Analytics"
        title="运营数据"
        description="查看最近 14 天的用户活跃、知识增长、问答、RAG 检索、AI 成本和文件上传。"
      >
        <Link
          href="/admin"
          className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          返回后台
        </Link>
        <Button variant="outline" onClick={() => loadAnalytics({ refresh: true })} disabled={refreshing || loading}>
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          刷新
        </Button>
      </PageHeader>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-line bg-white">
          <div className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载运营数据中
          </div>
        </div>
      ) : analytics ? (
        analytics.empty ? (
          <EmptyState />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {metrics.map((metric) => (
                <MetricCard key={metric.title} {...metric} />
              ))}
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <BarChart
                title="日活用户"
                description="每天至少有一次活跃行为的去重用户数。"
                points={analytics.series}
                getValue={(point) => point.dailyActiveUsers}
                valueLabel={formatCount}
              />
              <DualBarChart points={analytics.series} />
              <BarChart
                title="平均检索命中数"
                description="每天 RAG 检索平均返回的来源数量。"
                points={analytics.series}
                getValue={(point) => point.averageRetrievalHitCount ?? 0}
                valueLabel={(value) => value.toFixed(2)}
                accent="bg-coral"
              />
              <BarChart
                title="AI 调用成本估算"
                description="基于记录的 token 和可配置单价估算。"
                points={analytics.series}
                getValue={(point) => point.aiEstimatedCostUsd}
                valueLabel={formatUsd}
                accent="bg-slate-700"
              />
              <BarChart
                title="上传文件数量"
                description="成功解析并进入分析流程的文件数量。"
                points={analytics.series}
                getValue={(point) => point.uploadFileCount}
                valueLabel={formatCount}
                accent="bg-amber-500"
              />
              <RetentionPanel analytics={analytics} />
            </div>
          </>
        )
      ) : (
        <EmptyState />
      )}
    </div>
  );
}
