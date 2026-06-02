"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Database,
  Loader2,
  LineChart,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Users
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { unwrapApiResponse } from "@/lib/api/client";

type HealthStatus = "healthy" | "degraded" | "down";

type AdminOverviewResponse = {
  metrics: {
    userCount: number | null;
    knowledgeCount: number | null;
    aiCallsToday: number;
    recentErrorCount: number;
    betaPendingCount: number | null;
    openFeedbackCount: number | null;
  };
  health: {
    status: HealthStatus;
    checkedAt: string;
    database: {
      ok: boolean;
      latencyMs: number | null;
      configured: boolean;
    };
    openai: {
      configured: boolean;
    };
    logging: {
      recentEntryCount: number;
      inMemoryWindow: boolean;
    };
  };
  recentErrors: Array<{
    timestamp: string;
    level: string;
    event: string;
    requestId: unknown;
    path: unknown;
    method: unknown;
    operation: unknown;
    code: unknown;
    statusCode: unknown;
    error: unknown;
  }>;
  users: Array<{
    id: string;
    email: string;
    name: string;
    betaAccess: boolean;
    betaRequestedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  feedback: Array<{
    id: string;
    type: string;
    content: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    user: {
      id: string;
      email: string;
      name: string;
    };
  }>;
};

type MetricCardProps = {
  title: string;
  value: string;
  description: string;
  icon: typeof Users;
};

const statusConfig: Record<HealthStatus, {
  label: string;
  variant: "default" | "secondary" | "warning";
  icon: typeof CheckCircle2;
}> = {
  healthy: {
    label: "健康",
    variant: "default",
    icon: CheckCircle2
  },
  degraded: {
    label: "降级",
    variant: "warning",
    icon: AlertTriangle
  },
  down: {
    label: "异常",
    variant: "warning",
    icon: AlertTriangle
  }
};
const feedbackTypeLabels: Record<string, string> = {
  ISSUE: "问题",
  SUGGESTION: "建议",
  BUG: "Bug",
  RAG_HELPFUL: "回答有帮助",
  RAG_NOT_HELPFUL: "回答没帮助"
};
const feedbackStatusLabels: Record<string, string> = {
  OPEN: "待处理",
  REVIEWING: "处理中",
  RESOLVED: "已解决",
  ARCHIVED: "已归档"
};

function formatCount(value: number | null) {
  return value === null ? "-" : value.toLocaleString("zh-CN");
}

function formatTime(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}

function stringifySafe(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return "-";
  }
}

function getPathOrOperation(entry: AdminOverviewResponse["recentErrors"][number]) {
  return entry.path || entry.operation;
}

function MetricCard({ title, value, description, icon: Icon }: MetricCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardDescription>{title}</CardDescription>
          <CardTitle className="mt-2 text-3xl">{value}</CardTitle>
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

function HealthPanel({ overview }: { overview: AdminOverviewResponse }) {
  const config = statusConfig[overview.health.status];
  const Icon = config.icon;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>系统健康状态</CardTitle>
          <CardDescription>最近检查：{formatTime(overview.health.checkedAt)}</CardDescription>
        </div>
        <Badge variant={config.variant} className="gap-1.5">
          <Icon className="h-3.5 w-3.5" />
          {config.label}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-line bg-canvas p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Database className="h-4 w-4 text-teal-700" />
              数据库
            </div>
            <p className="mt-2 text-sm text-muted">
              {overview.health.database.ok ? "连接正常" : "连接异常"}
              {overview.health.database.latencyMs !== null ? ` · ${overview.health.database.latencyMs}ms` : ""}
            </p>
          </div>
          <div className="rounded-lg border border-line bg-canvas p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Bot className="h-4 w-4 text-teal-700" />
              OpenAI
            </div>
            <p className="mt-2 text-sm text-muted">
              {overview.health.openai.configured ? "已配置可用 key" : "未配置真实 key"}
            </p>
          </div>
          <div className="rounded-lg border border-line bg-canvas p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Activity className="h-4 w-4 text-teal-700" />
              日志窗口
            </div>
            <p className="mt-2 text-sm text-muted">
              已缓存 {overview.health.logging.recentEntryCount} 条运行期日志
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RecentErrors({ overview }: { overview: AdminOverviewResponse }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>最近错误日志</CardTitle>
        <CardDescription>仅展示脱敏后的运行期错误摘要。</CardDescription>
      </CardHeader>
      <CardContent>
        {overview.recentErrors.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line bg-canvas px-4 py-8 text-center text-sm text-muted">
            暂无错误日志
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase text-muted">
                <tr>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">时间</th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">级别</th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">事件</th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">状态</th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">路径/操作</th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">Request ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {overview.recentErrors.map((entry, index) => (
                  <tr key={`${entry.timestamp}-${entry.event}-${index}`}>
                    <td className="whitespace-nowrap px-3 py-3 text-muted">{formatTime(entry.timestamp)}</td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <Badge variant={entry.level === "error" ? "warning" : "secondary"}>{entry.level}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-medium text-ink">{entry.event}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted">
                      {stringifySafe(entry.code)}
                      {entry.statusCode ? ` / ${stringifySafe(entry.statusCode)}` : ""}
                    </td>
                    <td className="max-w-[280px] truncate px-3 py-3 text-muted">
                      {stringifySafe(getPathOrOperation(entry))}
                    </td>
                    <td className="max-w-[240px] truncate px-3 py-3 font-mono text-xs text-muted">
                      {stringifySafe(entry.requestId)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BetaUsersPanel({
  overview,
  updatingUserId,
  onUpdateBetaAccess
}: {
  overview: AdminOverviewResponse;
  updatingUserId: string | null;
  onUpdateBetaAccess: (userId: string, betaAccess: boolean) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Beta 测试资格</CardTitle>
        <CardDescription>审核等待名单，并为用户开启或关闭 betaAccess。</CardDescription>
      </CardHeader>
      <CardContent>
        {overview.users.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line bg-canvas px-4 py-8 text-center text-sm text-muted">
            暂无用户
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase text-muted">
                <tr>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">用户</th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">状态</th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">申请时间</th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">创建时间</th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {overview.users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-3 py-3">
                      <p className="font-medium text-ink">{user.name}</p>
                      <p className="mt-1 text-xs text-muted">{user.email}</p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <Badge variant={user.betaAccess ? "default" : user.betaRequestedAt ? "warning" : "secondary"}>
                        {user.betaAccess ? "已开通" : user.betaRequestedAt ? "待审核" : "未申请"}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted">
                      {user.betaRequestedAt ? formatTime(user.betaRequestedAt) : "-"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted">{formatTime(user.createdAt)}</td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <Button
                        size="sm"
                        variant={user.betaAccess ? "outline" : "secondary"}
                        onClick={() => onUpdateBetaAccess(user.id, !user.betaAccess)}
                        disabled={updatingUserId === user.id}
                      >
                        {updatingUserId === user.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ShieldCheck className="h-4 w-4" />
                        )}
                        {user.betaAccess ? "关闭" : "开通"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FeedbackPanel({ overview }: { overview: AdminOverviewResponse }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>用户反馈</CardTitle>
        <CardDescription>查看用户提交的问题、建议、Bug 和 RAG 回答反馈。</CardDescription>
      </CardHeader>
      <CardContent>
        {overview.feedback.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line bg-canvas px-4 py-8 text-center text-sm text-muted">
            暂无用户反馈
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase text-muted">
                <tr>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">类型</th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">状态</th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">用户</th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">内容</th>
                  <th className="whitespace-nowrap px-3 py-3 font-semibold">时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {overview.feedback.map((item) => (
                  <tr key={item.id}>
                    <td className="whitespace-nowrap px-3 py-3">
                      <Badge variant={item.type === "BUG" || item.type === "RAG_NOT_HELPFUL" ? "warning" : "secondary"}>
                        {feedbackTypeLabels[item.type] ?? item.type}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <Badge variant={item.status === "OPEN" ? "warning" : "outline"}>
                        {feedbackStatusLabels[item.status] ?? item.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-ink">{item.user.name}</p>
                      <p className="mt-1 text-xs text-muted">{item.user.email}</p>
                    </td>
                    <td className="max-w-[440px] px-3 py-3">
                      <p className="line-clamp-3 whitespace-pre-wrap text-muted">{item.content}</p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted">{formatTime(item.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminDashboard() {
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const metrics = useMemo(() => {
    if (!overview) {
      return [];
    }

    return [
      {
        title: "用户数量",
        value: formatCount(overview.metrics.userCount),
        description: "当前应用用户表中的账号总数。",
        icon: Users
      },
      {
        title: "知识总数",
        value: formatCount(overview.metrics.knowledgeCount),
        description: "所有用户创建的知识记录总数。",
        icon: Database
      },
      {
        title: "今日 AI 调用",
        value: overview.metrics.aiCallsToday.toLocaleString("zh-CN"),
        description: "当前运行期日志窗口内今天记录的 AI 调用次数。",
        icon: Bot
      },
      {
        title: "近 1 小时错误",
        value: overview.metrics.recentErrorCount.toLocaleString("zh-CN"),
        description: "最近一小时脱敏错误日志数量。",
        icon: AlertTriangle
      },
      {
        title: "Beta 待审核",
        value: formatCount(overview.metrics.betaPendingCount),
        description: "已申请但尚未开通 betaAccess 的用户。",
        icon: ShieldCheck
      },
      {
        title: "待处理反馈",
        value: formatCount(overview.metrics.openFeedbackCount),
        description: "当前仍处于待处理状态的用户反馈。",
        icon: MessageSquare
      }
    ];
  }, [overview]);

  async function loadOverview(options?: { refresh?: boolean }) {
    if (options?.refresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const response = await fetch("/api/admin/overview");
      const data = await unwrapApiResponse<AdminOverviewResponse>(response, "加载管理后台失败。");

      setOverview(data);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "加载管理后台失败。");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadOverview();
  }, []);

  async function updateBetaAccess(userId: string, betaAccess: boolean) {
    setUpdatingUserId(userId);
    setError("");

    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ userId, betaAccess })
      });

      await unwrapApiResponse<unknown>(response, "更新 Beta 测试资格失败。");
      await loadOverview({ refresh: true });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "更新 Beta 测试资格失败。");
    } finally {
      setUpdatingUserId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="管理后台"
        description="查看系统运行状态、核心计数、AI 调用和最近错误。"
      >
        <Link
          href="/admin/analytics"
          className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink hover:bg-slate-50"
        >
          <LineChart className="h-4 w-4" />
          运营数据
        </Link>
        <Button variant="outline" onClick={() => loadOverview({ refresh: true })} disabled={refreshing || loading}>
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
            加载管理数据中
          </div>
        </div>
      ) : overview ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {metrics.map((metric) => (
              <MetricCard key={metric.title} {...metric} />
            ))}
          </div>

          <HealthPanel overview={overview} />
          <FeedbackPanel overview={overview} />
          <BetaUsersPanel
            overview={overview}
            updatingUserId={updatingUserId}
            onUpdateBetaAccess={updateBetaAccess}
          />
          <RecentErrors overview={overview} />
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-line bg-white px-4 py-12 text-center text-sm text-muted">
          暂无管理数据
        </div>
      )}
    </div>
  );
}
