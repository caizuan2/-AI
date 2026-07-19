"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createIndustryStandard } from "@/apps/team-os/features/industry-coach/services/industry-coach-client";
import type { IndustryStandardStatus } from "@/apps/team-os/features/industry-coach/types";

export function IndustryStandardForm({ companyId, onCreated, onCancel }: { companyId: string; onCreated: () => void | Promise<void>; onCancel: () => void }) {
  const [category, setCategory] = React.useState("sales");
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [version, setVersion] = React.useState("1");
  const [status, setStatus] = React.useState<IndustryStandardStatus>("ACTIVE");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    const parsedVersion = Number(version);
    if (!Number.isInteger(parsedVersion) || parsedVersion < 1 || parsedVersion > 10_000) {
      setError("标准版本必须是 1 到 10000 之间的整数。");
      return;
    }

    setSubmitting(true);
    try {
      await createIndustryStandard({
        companyId,
        category: category.trim(),
        title: title.trim(),
        content: content.trim(),
        version: parsedVersion,
        status
      });
      await onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "行业标准创建失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="border-indigo-200 shadow-lg shadow-indigo-100/50">
      <CardHeader>
        <CardTitle>新增行业标准</CardTitle>
        <CardDescription>保存企业销售 SOP、产品规范或标准话术，供 AI 分析流程按权限引用。</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-5 md:grid-cols-2" onSubmit={handleSubmit} aria-busy={submitting}>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            标准分类
            <Input value={category} onChange={(event) => setCategory(event.target.value)} disabled={submitting} maxLength={80} placeholder="例如：sales" autoFocus required />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            标准标题
            <Input value={title} onChange={(event) => setTitle(event.target.value)} disabled={submitting} maxLength={160} placeholder="例如：客户破冰标准" required />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            版本
            <Input type="number" min={1} max={10000} step={1} value={version} onChange={(event) => setVersion(event.target.value)} disabled={submitting} required />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            状态
            <select value={status} onChange={(event) => setStatus(event.target.value as IndustryStandardStatus)} disabled={submitting} className="focus-ring flex h-11 w-full min-w-0 rounded-lg border border-line bg-white px-3 text-sm text-ink shadow-sm disabled:cursor-wait disabled:opacity-60">
              <option value="ACTIVE">启用</option>
              <option value="DISABLED">停用</option>
            </select>
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
            标准内容
            <Textarea value={content} onChange={(event) => setContent(event.target.value)} disabled={submitting} maxLength={30000} rows={12} placeholder="填写标准流程、判断依据、标准话术及注意事项。" required />
          </label>
          {error ? <p className="break-words text-sm text-rose-700 [overflow-wrap:anywhere] md:col-span-2" role="alert">{error}</p> : null}
          <div className="flex flex-wrap justify-end gap-3 md:col-span-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>取消</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "创建中…" : "保存标准"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
