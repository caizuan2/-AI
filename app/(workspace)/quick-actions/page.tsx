"use client";

import React, { FormEvent, useEffect, useState } from "react";
import {
  Check,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  TriangleAlert,
  X
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { unwrapApiResponse } from "@/lib/api/client";

type SubmitState = "idle" | "loading" | "success" | "error";

type QuickActionCategory = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  type: string | null;
  action: string | null;
  prompt: string | null;
  enabled: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

type QuickActionsResponse = {
  quickActions: QuickActionCategory[];
};

type QuickActionMutationResponse = {
  quickAction: QuickActionCategory;
};

type QuickActionForm = {
  id: string;
  name: string;
  description: string;
  icon: string;
  type: string;
  action: string;
  prompt: string;
  enabled: boolean;
  sortOrder: number;
};

const emptyForm: QuickActionForm = {
  id: "",
  name: "",
  description: "",
  icon: "sparkles",
  type: "prompt",
  action: "fill_prompt",
  prompt: "",
  enabled: true,
  sortOrder: 0
};

const actionOptions = [
  ["fill_prompt", "填入提示词"],
  ["send_prompt", "直接发送提示词"],
  ["open_upload", "打开上传菜单"],
  ["open_camera", "打开相机"],
  ["none", "仅展示，点击提示待接入"]
];

const iconOptions = ["zap", "sparkles", "image", "video", "camera", "upload"];

function toForm(item: QuickActionCategory): QuickActionForm {
  return {
    id: item.id,
    name: item.name,
    description: item.description ?? "",
    icon: item.icon ?? "sparkles",
    type: item.type ?? "prompt",
    action: item.action ?? "fill_prompt",
    prompt: item.prompt ?? "",
    enabled: item.enabled,
    sortOrder: item.sortOrder
  };
}

function toPayload(form: QuickActionForm) {
  return {
    id: form.id || undefined,
    name: form.name,
    description: form.description,
    icon: form.icon,
    type: form.type,
    action: form.action,
    prompt: form.prompt,
    enabled: form.enabled,
    sortOrder: form.sortOrder
  };
}

export default function QuickActionsPage() {
  const [items, setItems] = useState<QuickActionCategory[]>([]);
  const [form, setForm] = useState<QuickActionForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [actionState, setActionState] = useState<SubmitState>("idle");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const editing = Boolean(form.id);

  async function loadQuickActions() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/quick-actions");
      const data = await unwrapApiResponse<QuickActionsResponse>(response, "加载快捷分类失败。");

      setItems(data.quickActions);
      setForm((current) => current.id ? current : { ...emptyForm, sortOrder: data.quickActions.length });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "加载快捷分类失败。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadQuickActions();
  }, []);

  function resetForm() {
    setForm({ ...emptyForm, sortOrder: items.length });
    setActionState("idle");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionState("loading");
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/admin/quick-actions", {
        method: editing ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(toPayload(form))
      });
      const data = await unwrapApiResponse<QuickActionMutationResponse>(response, editing ? "更新快捷分类失败。" : "新增快捷分类失败。");

      setSuccess(editing ? `已更新「${data.quickAction.name}」。` : `已新增「${data.quickAction.name}」。`);
      setActionState("success");
      resetForm();
      await loadQuickActions();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "保存快捷分类失败。");
      setActionState("error");
    }
  }

  async function handleDelete(item: QuickActionCategory) {
    if (!window.confirm(`确认删除快捷分类「${item.name}」吗？`)) {
      return;
    }

    setActionState("loading");
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`/api/admin/quick-actions?id=${encodeURIComponent(item.id)}`, {
        method: "DELETE"
      });

      await unwrapApiResponse(response, "删除快捷分类失败。");
      setSuccess(`已删除「${item.name}」。`);
      setActionState("success");
      await loadQuickActions();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "删除快捷分类失败。");
      setActionState("error");
    }
  }

  function updateForm<K extends keyof QuickActionForm>(key: K, value: QuickActionForm[K]) {
    setForm((current) => ({
      ...current,
      [key]: value
    }));
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        eyebrow="Quick Actions"
        title="快捷分类管理"
        description="独立维护用户端 /chat-ui 底部快捷功能条，启用后普通用户刷新即可看到。"
      >
        <Button variant="outline" onClick={loadQuickActions} disabled={loading || actionState === "loading"}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          刷新
        </Button>
      </PageHeader>

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

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-teal-700" />
              <CardTitle>快捷分类列表</CardTitle>
            </div>
            <CardDescription>禁用项不会显示在用户端快捷功能条中。</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas p-6 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在加载快捷分类...
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line p-10 text-center text-sm text-muted">
                暂无快捷分类。可以先新增一条，用户端会自动读取启用项。
              </div>
            ) : (
              <div className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                {items.map((item) => (
                  <div key={item.id} className="grid gap-3 bg-white p-4 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={item.enabled ? "default" : "secondary"}>{item.enabled ? "启用" : "禁用"}</Badge>
                        <span className="font-semibold text-ink">{item.name}</span>
                        <span className="text-xs text-muted">排序 {item.sortOrder}</span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted">
                        {item.description || item.prompt || "未填写描述或提示词。"}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
                        <span>图标：{item.icon || "-"}</span>
                        <span>类型：{item.type || "-"}</span>
                        <span>动作：{item.action || "-"}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <Button type="button" variant="outline" size="sm" onClick={() => setForm(toForm(item))}>
                        <Pencil className="h-4 w-4" />
                        编辑
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => handleDelete(item)}>
                        <Trash2 className="h-4 w-4" />
                        删除
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              {editing ? <Pencil className="h-4 w-4 text-teal-700" /> : <Plus className="h-4 w-4 text-teal-700" />}
              <CardTitle>{editing ? "编辑快捷分类" : "新增快捷分类"}</CardTitle>
            </div>
            <CardDescription>保存后，用户端刷新 /chat-ui 即可读取启用项。</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-ink">分类名称</span>
                <Input
                  className="mt-2"
                  value={form.name}
                  onChange={(event) => updateForm("name", event.target.value)}
                  placeholder="例如 AI 创作"
                  required
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-ink">描述</span>
                <Input
                  className="mt-2"
                  value={form.description}
                  onChange={(event) => updateForm("description", event.target.value)}
                  placeholder="用于后台识别，不会泄露内部信息"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-ink">图标</span>
                  <select
                    className="focus-ring mt-2 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink shadow-sm"
                    value={form.icon}
                    onChange={(event) => updateForm("icon", event.target.value)}
                  >
                    {iconOptions.map((icon) => (
                      <option key={icon} value={icon}>{icon}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-ink">排序</span>
                  <Input
                    className="mt-2"
                    type="number"
                    value={form.sortOrder}
                    onChange={(event) => updateForm("sortOrder", Number(event.target.value))}
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-ink">类型</span>
                  <Input
                    className="mt-2"
                    value={form.type}
                    onChange={(event) => updateForm("type", event.target.value)}
                    placeholder="prompt / tool / mode"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-ink">点击动作</span>
                  <select
                    className="focus-ring mt-2 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink shadow-sm"
                    value={form.action}
                    onChange={(event) => updateForm("action", event.target.value)}
                  >
                    {actionOptions.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="text-sm font-medium text-ink">快捷提示词</span>
                <Textarea
                  className="mt-2"
                  value={form.prompt}
                  onChange={(event) => updateForm("prompt", event.target.value)}
                  placeholder="点击快捷分类后填入或发送的内容"
                />
              </label>

              <label className="flex items-center justify-between gap-3 rounded-lg border border-line p-3">
                <span>
                  <span className="block text-sm font-medium text-ink">启用</span>
                  <span className="block text-xs text-muted">关闭后用户端不会展示该快捷分类。</span>
                </span>
                <input
                  checked={form.enabled}
                  onChange={(event) => updateForm("enabled", event.target.checked)}
                  type="checkbox"
                  className="h-5 w-5 rounded border-line text-teal-600"
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={actionState === "loading"}>
                  {actionState === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {editing ? "保存修改" : "新增分类"}
                </Button>
                {editing ? (
                  <Button type="button" variant="outline" onClick={resetForm}>
                    <X className="h-4 w-4" />
                    取消编辑
                  </Button>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
