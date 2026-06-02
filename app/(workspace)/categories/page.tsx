"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Check,
  FolderOpen,
  GitMerge,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
  TriangleAlert,
  X
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { unwrapApiResponse } from "@/lib/api/client";

const DEFAULT_CATEGORY = "未分类";

type SubmitState = "idle" | "loading" | "success" | "error";

type CategorySummary = {
  name: string;
  count: number;
};

type CategoriesResponse = {
  categories: CategorySummary[];
  totalCategories: number;
  totalItems: number;
};

type CategoryMutationResponse = CategoriesResponse & {
  updatedItems: number;
};

export default function CategoriesPage() {
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionState, setActionState] = useState<SubmitState>("idle");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editingCategory, setEditingCategory] = useState("");
  const [editingValue, setEditingValue] = useState("");
  const [mergeSource, setMergeSource] = useState("");
  const [mergeTarget, setMergeTarget] = useState("");

  const totalItems = useMemo(
    () => categories.reduce((total, category) => total + category.count, 0),
    [categories]
  );

  async function loadCategories() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/categories");
      const data = await unwrapApiResponse<CategoriesResponse>(response, "加载分类失败。");

      setCategories(data.categories);
      setMergeSource((current) => current || data.categories[0]?.name || "");
      setMergeTarget((current) => current || data.categories.find((category) => category.name !== data.categories[0]?.name)?.name || DEFAULT_CATEGORY);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "加载分类失败。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCategories();
  }, []);

  function applyMutationResult(data: CategoryMutationResponse, message: string) {
    setCategories(data.categories);
    setSuccess(`${message}，已更新 ${data.updatedItems} 条知识。`);
    setError("");
    setActionState("success");
    setEditingCategory("");
    setEditingValue("");

    const nextSource = data.categories.find((category) => category.name !== mergeTarget)?.name || data.categories[0]?.name || "";
    const nextTarget = data.categories.find((category) => category.name !== nextSource)?.name || DEFAULT_CATEGORY;

    if (!data.categories.some((category) => category.name === mergeSource)) {
      setMergeSource(nextSource);
    }

    if (!data.categories.some((category) => category.name === mergeTarget)) {
      setMergeTarget(nextTarget);
    }
  }

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const from = editingCategory.trim();
    const to = editingValue.trim();

    if (!from || !to) {
      setError("请输入要重命名的分类。");
      setActionState("error");
      return;
    }

    setActionState("loading");
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/categories", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ from, to })
      });
      const data = await unwrapApiResponse<CategoryMutationResponse>(response, "重命名分类失败。");

      applyMutationResult(data, `已将「${from}」重命名为「${to}」`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "重命名分类失败。");
      setActionState("error");
    }
  }

  async function handleDelete(category: string) {
    if (!window.confirm(`确认删除分类「${category}」吗？该分类下的知识会移动到「${DEFAULT_CATEGORY}」。`)) {
      return;
    }

    setActionState("loading");
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`/api/categories?category=${encodeURIComponent(category)}`, {
        method: "DELETE"
      });
      const data = await unwrapApiResponse<CategoryMutationResponse>(response, "删除分类失败。");

      applyMutationResult(data, `已删除分类「${category}」`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "删除分类失败。");
      setActionState("error");
    }
  }

  async function handleMerge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sourceCategory = mergeSource.trim();
    const targetCategory = mergeTarget.trim();

    if (!sourceCategory || !targetCategory) {
      setError("请选择待合并分类和目标分类。");
      setActionState("error");
      return;
    }

    setActionState("loading");
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sourceCategories: [sourceCategory],
          targetCategory
        })
      });
      const data = await unwrapApiResponse<CategoryMutationResponse>(response, "合并分类失败。");

      applyMutationResult(data, `已将「${sourceCategory}」合并到「${targetCategory}」`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "合并分类失败。");
      setActionState("error");
    }
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="Categories"
        title="分类管理"
        description="集中维护知识分类，分类变化会同步影响知识列表筛选和后续投喂分析。"
      >
        <Button variant="outline" onClick={loadCategories} disabled={loading || actionState === "loading"}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          刷新
        </Button>
      </PageHeader>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          { label: "分类总数", value: categories.length },
          { label: "知识总数", value: totalItems },
          { label: "最高频分类", value: categories[0] ? `${categories[0].name} · ${categories[0].count}` : "暂无" }
        ].map((metric) => (
          <div key={metric.label} className="rounded-lg border border-line bg-white p-5 shadow-sm">
            <p className="text-sm text-muted">{metric.label}</p>
            <p className="mt-3 text-2xl font-semibold text-ink">{metric.value}</p>
          </div>
        ))}
      </section>

      {error ? (
        <section className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <TriangleAlert className="h-4 w-4" />
          {error}
        </section>
      ) : null}

      {success ? (
        <section className="flex items-center gap-2 rounded-lg border border-teal-100 bg-teal-50 px-4 py-3 text-sm text-teal-700">
          <Check className="h-4 w-4" />
          {success}
        </section>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <GitMerge className="h-4 w-4 text-teal-700" />
            <CardTitle>合并分类</CardTitle>
          </div>
          <CardDescription>把一个旧分类合并到已有或新分类，相关知识会统一移动到目标分类。</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleMerge} className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
            <label className="block">
              <span className="text-sm font-medium text-ink">待合并分类</span>
              <select
                value={mergeSource}
                onChange={(event) => setMergeSource(event.target.value)}
                className="focus-ring mt-2 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink shadow-sm"
              >
                <option value="">请选择</option>
                {categories.map((category) => (
                  <option key={category.name} value={category.name}>
                    {category.name} · {category.count}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink">目标分类</span>
              <Input
                className="mt-2"
                value={mergeTarget}
                onChange={(event) => setMergeTarget(event.target.value)}
                placeholder="选择已有分类或输入新分类"
                list="category-options"
              />
              <datalist id="category-options">
                {categories
                  .filter((category) => category.name !== mergeSource)
                  .map((category) => (
                    <option key={category.name} value={category.name} />
                  ))}
              </datalist>
            </label>
            <Button type="submit" disabled={actionState === "loading" || categories.length === 0} className="mt-auto h-11">
              {actionState === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />}
              合并
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-teal-700" />
            <CardTitle>所有分类</CardTitle>
          </div>
          <CardDescription>每个分类后的数字表示该分类下的知识数量。</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas p-6 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在加载分类...
            </div>
          ) : categories.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line p-10 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-slate-100 text-slate-500">
                <FolderOpen className="h-5 w-5" />
              </div>
              <p className="mt-4 text-sm font-medium text-ink">暂无分类</p>
              <p className="mt-2 text-sm text-muted">知识入库后，分类会自动出现在这里。</p>
            </div>
          ) : (
            <div className="divide-y divide-line overflow-hidden rounded-lg border border-line">
              {categories.map((category) => {
                const isEditing = editingCategory === category.name;

                return (
                  <div key={category.name} className="grid gap-3 bg-white p-4 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Badge variant={category.name === DEFAULT_CATEGORY ? "warning" : "secondary"}>{category.name}</Badge>
                      <span className="text-sm text-muted">{category.count} 条知识</span>
                    </div>

                    {isEditing ? (
                      <form onSubmit={handleRename} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Input
                          value={editingValue}
                          onChange={(event) => setEditingValue(event.target.value)}
                          className="sm:w-56"
                          autoFocus
                        />
                        <Button type="submit" size="sm" disabled={actionState === "loading"}>
                          {actionState === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          保存
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingCategory("");
                            setEditingValue("");
                          }}
                        >
                          <X className="h-4 w-4" />
                          取消
                        </Button>
                      </form>
                    ) : (
                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingCategory(category.name);
                            setEditingValue(category.name);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                          重命名
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(category.name)}
                          disabled={actionState === "loading" || category.name === DEFAULT_CATEGORY}
                        >
                          <Trash2 className="h-4 w-4" />
                          删除
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
