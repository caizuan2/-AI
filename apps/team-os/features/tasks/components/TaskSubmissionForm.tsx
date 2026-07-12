"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, ImagePlus, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { submitTask } from "@/apps/team-os/features/tasks/services/task-client";
import type { TaskListItem } from "@/apps/team-os/features/tasks/types";

function lines(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

export function TaskSubmissionForm({ task }: { task: TaskListItem }) {
  const [content, setContent] = React.useState("");
  const [images, setImages] = React.useState("");
  const [attachments, setAttachments] = React.useState("");
  const [summary, setSummary] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submissionId, setSubmissionId] = React.useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!content.trim() && lines(images).length === 0 && lines(attachments).length === 0) {
      setError("请填写聊天记录，或提供至少一个图片、附件地址。");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      setSubmissionId(await submitTask(task.id, {
        content,
        images: lines(images),
        attachments: lines(attachments),
        summary
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "任务提交失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  if (submissionId) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/60">
        <CardContent className="flex min-h-64 flex-col items-center justify-center text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-600" aria-hidden="true" />
          <h2 className="mt-4 text-xl font-semibold text-emerald-950">任务证据已提交</h2>
          <p className="mt-2 text-sm text-emerald-800">完成记录编号：{submissionId}</p>
          <Link
            href="/team-os/tasks/my"
            className="focus-ring mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-ink px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            返回我的任务
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle>{task.title}</CardTitle>
        <CardDescription className="whitespace-pre-line">{task.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={handleSubmit}>
          <label className="block space-y-2 text-sm font-medium text-slate-700">
            聊天记录或执行内容
            <Textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="粘贴本次客户沟通记录或说明执行过程。" maxLength={20000} />
          </label>

          <label className="block space-y-2 text-sm font-medium text-slate-700">
            <span className="inline-flex items-center gap-2"><ImagePlus className="h-4 w-4" />聊天截图地址</span>
            <Textarea value={images} onChange={(event) => setImages(event.target.value)} placeholder="图片上传接口预留：当前可每行填写一个 HTTP、HTTPS 或站内图片地址。" />
          </label>

          <label className="block space-y-2 text-sm font-medium text-slate-700">
            <span className="inline-flex items-center gap-2"><Paperclip className="h-4 w-4" />附件地址</span>
            <Textarea value={attachments} onChange={(event) => setAttachments(event.target.value)} placeholder="每行填写一个聊天记录或其他证据文件地址。" />
          </label>

          <label className="block space-y-2 text-sm font-medium text-slate-700">
            任务总结
            <Textarea value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="总结完成情况、客户反馈和下一步计划。" maxLength={5000} required />
          </label>

          {error ? <p className="text-sm text-rose-700" role="alert">{error}</p> : null}

          <div className="flex justify-end">
            <Button type="submit" disabled={submitting}>{submitting ? "提交中…" : "提交任务"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
