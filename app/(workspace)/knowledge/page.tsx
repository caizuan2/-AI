"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownWideNarrow,
  Archive,
  Database,
  FileCheck2,
  Loader2,
  RefreshCw,
  SlidersHorizontal,
  Tags,
  TriangleAlert,
  X
} from "lucide-react";
import { KnowledgeCard } from "@/components/knowledge-card";
import { PageHeader } from "@/components/page-header";
import { SearchInput } from "@/components/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { unwrapApiResponse } from "@/lib/api/client";
import type { KnowledgeStatus } from "@/types";

type KnowledgeListItem = {
  id: string;
  userId: string;
  title: string;
  content: string;
  summary: string;
  tags: string[];
  category: string;
  importance: number;
  clarityScore: number;
  completenessScore: number;
  usefulnessScore: number;
  confidenceScore: number;
  sourceType: string;
  sourceId: string | null;
  expiresAt: string | null;
  status: KnowledgeStatus;
  createdAt: string;
  updatedAt: string;
  chunkCount: number;
};

type KnowledgeListResponse = {
  items: KnowledgeListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
};

type TagsResponse = {
  tags: Array<{
    name: string;
    count: number;
  }>;
};

type CategoriesResponse = {
  categories: Array<{
    name: string;
    count: number;
  }>;
};

export default function KnowledgeListPage() {
  const [items, setItems] = useState<KnowledgeListItem[]>([]);
  const [allTags, setAllTags] = useState<TagsResponse["tags"]>([]);
  const [allCategories, setAllCategories] = useState<CategoriesResponse["categories"]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const [tag, setTag] = useState("全部");
  const [status, setStatus] = useState("全部");
  const [sort, setSort] = useState("updated_desc");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<KnowledgeListResponse["pagination"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;

    async function loadTags() {
      try {
        const response = await fetch("/api/tags");
        const data = await unwrapApiResponse<TagsResponse>(response, "加载标签失败。");

        if (!cancelled) {
          setAllTags(data.tags);

          if (tag !== "全部" && !data.tags.some((item) => item.name === tag)) {
            setTag("全部");
            setPage(1);
          }
        }
      } catch {
        if (!cancelled) {
          setAllTags([]);
        }
      }
    }

    loadTags();

    return () => {
      cancelled = true;
    };
  }, [tag]);

  useEffect(() => {
    let cancelled = false;

    async function loadCategories() {
      try {
        const response = await fetch("/api/categories");
        const data = await unwrapApiResponse<CategoriesResponse>(response, "加载分类失败。");

        if (!cancelled) {
          setAllCategories(data.categories);

          if (category !== "全部" && !data.categories.some((item) => item.name === category)) {
            setCategory("全部");
            setPage(1);
          }
        }
      } catch {
        if (!cancelled) {
          setAllCategories([]);
        }
      }
    }

    loadCategories();

    return () => {
      cancelled = true;
    };
  }, [category]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadKnowledge() {
      setLoading(true);
      setError("");

      const params = new URLSearchParams({
        page: String(page),
        pageSize: "12"
      });

      if (debouncedQuery) {
        params.set("q", debouncedQuery);
      }

      if (category !== "全部") {
        params.set("category", category);
      }

      if (tag !== "全部") {
        params.set("tag", tag);
      }

      if (status !== "全部") {
        params.set("status", status);
      }

      if (sort !== "updated_desc") {
        params.set("sort", sort);
      }

      try {
        const response = await fetch(`/api/knowledge?${params.toString()}`, {
          signal: controller.signal
        });

        const data = await unwrapApiResponse<KnowledgeListResponse>(response, "加载知识库失败。");

        setItems(data.items);
        setPagination(data.pagination);
      } catch (caughtError) {
        if (caughtError instanceof DOMException && caughtError.name === "AbortError") {
          return;
        }

        setError(caughtError instanceof Error ? caughtError.message : "加载知识库失败。");
      } finally {
        setLoading(false);
      }
    }

    loadKnowledge();

    return () => controller.abort();
  }, [category, debouncedQuery, page, sort, status, tag]);

  const categories = useMemo(
    () => ["全部", ...Array.from(new Set([category, ...allCategories.map((item) => item.name)].filter((item) => item !== "全部")))],
    [allCategories, category]
  );
  const tags = useMemo(
    () => ["全部", ...Array.from(new Set([tag, ...allTags.map((item) => item.name)].filter((item) => item !== "全部")))],
    [allTags, tag]
  );
  const statusOptions = [
    { value: "全部", label: "全部状态" },
    { value: "active", label: "有效" },
    { value: "stale", label: "已过期" },
    { value: "archived", label: "已归档" }
  ];
  const hasActiveFilter = query.trim().length > 0 || category !== "全部" || tag !== "全部" || status !== "全部" || sort !== "updated_desc";

  function resetFilters() {
    setQuery("");
    setDebouncedQuery("");
    setCategory("全部");
    setTag("全部");
    setStatus("全部");
    setSort("updated_desc");
    setPage(1);
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="Knowledge Base"
        title="知识库列表"
        description="集中查看已入库的知识资产，按分类、标签和关键词快速定位内容。"
      />

      <section className="grid gap-4 md:grid-cols-3">
        {[
          { label: "当前结果", value: pagination?.total ?? items.length, icon: Database },
          { label: "当前页", value: items.length, icon: FileCheck2 },
          { label: "页码", value: pagination ? `${pagination.page}/${Math.max(pagination.totalPages, 1)}` : "1/1", icon: RefreshCw }
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

      <section className="rounded-lg border border-line bg-white p-4 shadow-sm">
        <div className="grid gap-3 xl:grid-cols-[1fr_180px_180px_180px_180px]">
          <SearchInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题、摘要或正文"
          />
          <label className="relative">
            <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <select
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                setPage(1);
              }}
              className="focus-ring h-11 w-full appearance-none rounded-lg border border-line bg-white pl-10 pr-8 text-sm text-ink shadow-sm"
            >
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="relative">
            <Tags className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <select
              value={tag}
              onChange={(event) => {
                setTag(event.target.value);
                setPage(1);
              }}
              className="focus-ring h-11 w-full appearance-none rounded-lg border border-line bg-white pl-10 pr-8 text-sm text-ink shadow-sm"
            >
              {tags.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="relative">
            <Archive className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              className="focus-ring h-11 w-full appearance-none rounded-lg border border-line bg-white pl-10 pr-8 text-sm text-ink shadow-sm"
            >
              {statusOptions.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="relative">
            <ArrowDownWideNarrow className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <select
              value={sort}
              onChange={(event) => {
                setSort(event.target.value);
                setPage(1);
              }}
              className="focus-ring h-11 w-full appearance-none rounded-lg border border-line bg-white pl-10 pr-8 text-sm text-ink shadow-sm"
            >
              <option value="updated_desc">最近更新</option>
              <option value="quality_desc">质量高到低</option>
              <option value="quality_asc">质量低到高</option>
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">筛选结果 {pagination?.total ?? 0} 条</span>
          {category !== "全部" ? <Badge variant="outline">分类：{category}</Badge> : null}
          {tag !== "全部" ? <Badge variant="outline">标签：{tag}</Badge> : null}
          {status !== "全部" ? <Badge variant="outline">状态：{statusOptions.find((item) => item.value === status)?.label ?? status}</Badge> : null}
          {query.trim() ? <Badge variant="outline">关键词：{query.trim()}</Badge> : null}
          {sort !== "updated_desc" ? <Badge variant="outline">排序：{sort === "quality_desc" ? "质量高到低" : "质量低到高"}</Badge> : null}
          {hasActiveFilter ? (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <X className="h-4 w-4" />
              清空
            </Button>
          ) : null}
        </div>
      </section>

      {error ? (
        <section className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <TriangleAlert className="h-4 w-4" />
          {error}
        </section>
      ) : null}

      {loading ? (
        <section className="flex items-center gap-2 rounded-lg border border-line bg-white p-6 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在加载知识库...
        </section>
      ) : items.length === 0 ? (
        <section className="rounded-lg border border-dashed border-line bg-white p-10 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-slate-100 text-slate-500">
            <Database className="h-5 w-5" />
          </div>
          <p className="mt-4 text-sm font-medium text-ink">没有匹配的知识条目</p>
          <p className="mt-2 text-sm text-muted">换一个关键词、标签或分类试试。</p>
          {hasActiveFilter ? (
            <Button variant="outline" className="mt-5" onClick={resetFilters}>
              清空筛选
            </Button>
          ) : null}
        </section>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <KnowledgeCard key={item.id} item={item} />
            ))}
          </section>

          {pagination && pagination.totalPages > 1 ? (
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                disabled={!pagination.hasPreviousPage}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                disabled={!pagination.hasNextPage}
                onClick={() => setPage((current) => current + 1)}
              >
                下一页
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
