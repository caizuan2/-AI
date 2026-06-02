"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Check,
  GitMerge,
  Loader2,
  Pencil,
  RefreshCw,
  Tags,
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

type SubmitState = "idle" | "loading" | "success" | "error";

type TagSummary = {
  name: string;
  count: number;
};

type TagsResponse = {
  tags: TagSummary[];
  totalTags: number;
  totalAssignments: number;
};

type TagMutationResponse = TagsResponse & {
  updatedItems: number;
};

export default function TagsPage() {
  const [tags, setTags] = useState<TagSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionState, setActionState] = useState<SubmitState>("idle");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editingTag, setEditingTag] = useState("");
  const [editingValue, setEditingValue] = useState("");
  const [mergeSource, setMergeSource] = useState("");
  const [mergeTarget, setMergeTarget] = useState("");

  const totalAssignments = useMemo(
    () => tags.reduce((total, tag) => total + tag.count, 0),
    [tags]
  );

  async function loadTags() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/tags");
      const data = await unwrapApiResponse<TagsResponse>(response, "加载标签失败。");

      setTags(data.tags);
      setMergeSource((current) => current || data.tags[0]?.name || "");
      setMergeTarget((current) => current || data.tags.find((tag) => tag.name !== data.tags[0]?.name)?.name || "");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "加载标签失败。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTags();
  }, []);

  function applyMutationResult(data: TagMutationResponse, message: string) {
    setTags(data.tags);
    setSuccess(`${message}，已更新 ${data.updatedItems} 条知识。`);
    setError("");
    setActionState("success");
    setEditingTag("");
    setEditingValue("");

    const nextSource = data.tags.find((tag) => tag.name !== mergeTarget)?.name || data.tags[0]?.name || "";
    const nextTarget = data.tags.find((tag) => tag.name !== nextSource)?.name || "";

    if (!data.tags.some((tag) => tag.name === mergeSource)) {
      setMergeSource(nextSource);
    }

    if (!data.tags.some((tag) => tag.name === mergeTarget)) {
      setMergeTarget(nextTarget);
    }
  }

  async function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const from = editingTag.trim();
    const to = editingValue.trim();

    if (!from || !to) {
      setError("请输入要重命名的标签。");
      setActionState("error");
      return;
    }

    setActionState("loading");
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/tags", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ from, to })
      });
      const data = await unwrapApiResponse<TagMutationResponse>(response, "重命名标签失败。");

      applyMutationResult(data, `已将「${from}」重命名为「${to}」`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "重命名标签失败。");
      setActionState("error");
    }
  }

  async function handleDelete(tag: string) {
    if (!window.confirm(`确认从所有知识中删除标签「${tag}」吗？知识条目本身不会被删除。`)) {
      return;
    }

    setActionState("loading");
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`/api/tags?tag=${encodeURIComponent(tag)}`, {
        method: "DELETE"
      });
      const data = await unwrapApiResponse<TagMutationResponse>(response, "删除标签失败。");

      applyMutationResult(data, `已删除标签「${tag}」`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "删除标签失败。");
      setActionState("error");
    }
  }

  async function handleMerge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sourceTag = mergeSource.trim();
    const targetTag = mergeTarget.trim();

    if (!sourceTag || !targetTag) {
      setError("请选择待合并标签和目标标签。");
      setActionState("error");
      return;
    }

    setActionState("loading");
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/tags", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sourceTags: [sourceTag],
          targetTag
        })
      });
      const data = await unwrapApiResponse<TagMutationResponse>(response, "合并标签失败。");

      applyMutationResult(data, `已将「${sourceTag}」合并到「${targetTag}」`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "合并标签失败。");
      setActionState("error");
    }
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="Tags"
        title="标签管理"
        description="集中维护知识标签，重命名、删除或合并后会同步更新知识库筛选。"
      >
        <Button variant="outline" onClick={loadTags} disabled={loading || actionState === "loading"}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          刷新
        </Button>
      </PageHeader>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          { label: "标签总数", value: tags.length },
          { label: "标签引用数", value: totalAssignments },
          { label: "最高频标签", value: tags[0] ? `${tags[0].name} · ${tags[0].count}` : "暂无" }
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
            <CardTitle>合并标签</CardTitle>
          </div>
          <CardDescription>把一个旧标签合并到已有或新标签，相关知识会保留目标标签。</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleMerge} className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
            <label className="block">
              <span className="text-sm font-medium text-ink">待合并标签</span>
              <select
                value={mergeSource}
                onChange={(event) => setMergeSource(event.target.value)}
                className="focus-ring mt-2 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink shadow-sm"
              >
                <option value="">请选择</option>
                {tags.map((tag) => (
                  <option key={tag.name} value={tag.name}>
                    {tag.name} · {tag.count}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-ink">目标标签</span>
              <Input
                className="mt-2"
                value={mergeTarget}
                onChange={(event) => setMergeTarget(event.target.value)}
                placeholder="选择已有标签或输入新标签"
                list="tag-options"
              />
              <datalist id="tag-options">
                {tags
                  .filter((tag) => tag.name !== mergeSource)
                  .map((tag) => (
                    <option key={tag.name} value={tag.name} />
                  ))}
              </datalist>
            </label>
            <Button type="submit" disabled={actionState === "loading" || tags.length === 0} className="mt-auto h-11">
              {actionState === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />}
              合并
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Tags className="h-4 w-4 text-teal-700" />
            <CardTitle>所有标签</CardTitle>
          </div>
          <CardDescription>每个标签后的数字表示包含该标签的知识数量。</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas p-6 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在加载标签...
            </div>
          ) : tags.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line p-10 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-slate-100 text-slate-500">
                <Tags className="h-5 w-5" />
              </div>
              <p className="mt-4 text-sm font-medium text-ink">暂无标签</p>
              <p className="mt-2 text-sm text-muted">知识入库后，标签会自动出现在这里。</p>
            </div>
          ) : (
            <div className="divide-y divide-line overflow-hidden rounded-lg border border-line">
              {tags.map((tag) => {
                const isEditing = editingTag === tag.name;

                return (
                  <div key={tag.name} className="grid gap-3 bg-white p-4 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Badge variant="secondary">{tag.name}</Badge>
                      <span className="text-sm text-muted">{tag.count} 条知识</span>
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
                            setEditingTag("");
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
                            setEditingTag(tag.name);
                            setEditingValue(tag.name);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                          重命名
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(tag.name)}
                          disabled={actionState === "loading"}
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
