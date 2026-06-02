"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Loader2,
  RotateCcw,
  TriangleAlert,
  XCircle
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { unwrapApiResponse } from "@/lib/api/client";
import {
  knowledgeReviewStatusLabels,
  type KnowledgeReviewStatus
} from "@/lib/knowledge/review";

type SubmitState = "idle" | "loading" | "success" | "error";

type ReviewItem = {
  id: string;
  title: string;
  summary: string;
  content: string;
  tags: string[];
  category: string;
  importance: number;
  reviewStatus: KnowledgeReviewStatus;
  lastReviewedAt: string | null;
  nextReviewAt: string | null;
  updatedAt: string;
};

type ReviewStats = {
  dueCount: number;
  needsReviewCount: number;
  masteredCount: number;
  expiredCount: number;
};

type ReviewResponse = {
  items: ReviewItem[];
  stats: ReviewStats;
  limit: number;
  generatedAt: string;
};

type ReviewUpdateResponse = {
  item: ReviewItem;
  stats: ReviewStats;
  nextReviewAt: string | null;
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "暂无";
  }

  return new Date(value).toLocaleString("zh-CN");
}

function formatNextReview(value: string | null) {
  if (!value) {
    return "不再推荐";
  }

  return new Date(value).toLocaleDateString("zh-CN");
}

export default function ReviewPage() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [stats, setStats] = useState<ReviewStats>({
    dueCount: 0,
    needsReviewCount: 0,
    masteredCount: 0,
    expiredCount: 0
  });
  const [limit, setLimit] = useState(5);
  const [loading, setLoading] = useState(true);
  const [actionState, setActionState] = useState<SubmitState>("idle");
  const [activeItemId, setActiveItemId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadReviewItems() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/review");
      const data = await unwrapApiResponse<ReviewResponse>(response, "加载复习知识失败。");

      setItems(data.items);
      setStats(data.stats);
      setLimit(data.limit);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "加载复习知识失败。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReviewItems();
  }, []);

  async function markReviewStatus(item: ReviewItem, reviewStatus: KnowledgeReviewStatus) {
    setActionState("loading");
    setActiveItemId(item.id);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/review", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          knowledgeItemId: item.id,
          reviewStatus
        })
      });
      const data = await unwrapApiResponse<ReviewUpdateResponse>(response, "更新复习状态失败。");

      setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      setStats(data.stats);
      setSuccess(`「${item.title}」已标记为${knowledgeReviewStatusLabels[reviewStatus]}，下次复习：${formatNextReview(data.nextReviewAt)}。`);
      setActionState("success");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "更新复习状态失败。");
      setActionState("error");
    } finally {
      setActiveItemId("");
    }
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="Review"
        title="知识复习"
        description={`每天推荐 ${limit} 条重要知识，按掌握情况自动安排下次复习。`}
      >
        <Button variant="outline" onClick={loadReviewItems} disabled={loading || actionState === "loading"}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          刷新
        </Button>
      </PageHeader>

      <section className="grid gap-4 md:grid-cols-4">
        {[
          { label: "今日待复习", value: stats.dueCount, icon: CalendarClock },
          { label: "需要复习", value: stats.needsReviewCount, icon: Clock3 },
          { label: "已掌握", value: stats.masteredCount, icon: CheckCircle2 },
          { label: "已过期", value: stats.expiredCount, icon: XCircle }
        ].map((metric) => {
          const Icon = metric.icon;

          return (
            <div key={metric.label} className="rounded-lg border border-line bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted">{metric.label}</p>
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-teal-50 text-teal-700">
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 text-3xl font-semibold text-ink">{metric.value}</p>
            </div>
          );
        })}
      </section>

      {error ? (
        <section className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <TriangleAlert className="h-4 w-4" />
          {error}
        </section>
      ) : null}

      {success ? (
        <section className="flex items-center gap-2 rounded-lg border border-teal-100 bg-teal-50 px-4 py-3 text-sm text-teal-700">
          <CheckCircle2 className="h-4 w-4" />
          {success}
        </section>
      ) : null}

      {loading ? (
        <section className="flex items-center gap-2 rounded-lg border border-line bg-white p-6 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在加载今日复习知识...
        </section>
      ) : items.length === 0 ? (
        <section className="rounded-lg border border-dashed border-line bg-white p-10 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-slate-100 text-slate-500">
            <BookOpenCheck className="h-5 w-5" />
          </div>
          <p className="mt-4 text-sm font-medium text-ink">今天没有需要复习的知识</p>
          <p className="mt-2 text-sm text-muted">继续投喂或稍后回来，系统会按重要程度和复习状态安排下一轮。</p>
        </section>
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          {items.map((item) => (
            <Card key={item.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{item.category}</Badge>
                      <Badge variant={item.importance >= 4 ? "warning" : "secondary"}>重要度 {item.importance}</Badge>
                      <Badge variant="outline">{knowledgeReviewStatusLabels[item.reviewStatus]}</Badge>
                    </div>
                    <CardTitle className="mt-3">{item.title}</CardTitle>
                    <CardDescription className="mt-2">{item.summary}</CardDescription>
                  </div>
                  <Link href={`/knowledge/${item.id}`} className="focus-ring rounded text-muted hover:text-teal-700" aria-label="查看知识详情">
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="line-clamp-4 text-sm leading-6 text-slate-700">{item.content}</p>

                <div className="grid gap-2 text-xs text-muted sm:grid-cols-2">
                  <p>上次复习：{formatDateTime(item.lastReviewedAt)}</p>
                  <p>下次复习：{formatDateTime(item.nextReviewAt)}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {item.tags.slice(0, 6).map((tag) => (
                    <Badge key={tag} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <Button
                    type="button"
                    onClick={() => markReviewStatus(item, "MASTERED")}
                    disabled={actionState === "loading"}
                  >
                    {activeItemId === item.id && actionState === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    已掌握
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => markReviewStatus(item, "NEEDS_REVIEW")}
                    disabled={actionState === "loading"}
                  >
                    {activeItemId === item.id && actionState === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock3 className="h-4 w-4" />}
                    需要复习
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => markReviewStatus(item, "EXPIRED")}
                    disabled={actionState === "loading"}
                  >
                    {activeItemId === item.id && actionState === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                    已过期
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      )}
    </div>
  );
}
