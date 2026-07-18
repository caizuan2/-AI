"use client";

import * as React from "react";
import { Bot, LoaderCircle, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveTrainingCourse } from "@/apps/team-os/features/training/services/training-client";
import {
  trainingCategoryLabels,
  trainingLevelLabels
} from "@/apps/team-os/features/training/components/TrainingBadges";
import {
  TRAINING_COURSE_CATEGORIES,
  TRAINING_COURSE_LEVELS,
  type TrainingCourseCategory,
  type TrainingCourseLevel,
  type TrainingCourseRecord,
  type TrainingCourseStatus
} from "@/apps/team-os/features/training/types";

export function TrainingCourseForm({
  companyId,
  initialCourse,
  onSaved,
  onCancel
}: {
  companyId: string;
  initialCourse?: TrainingCourseRecord;
  onSaved: (course: TrainingCourseRecord) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = React.useState(initialCourse?.title ?? "");
  const [description, setDescription] = React.useState(initialCourse?.description ?? "");
  const [content, setContent] = React.useState(initialCourse?.content ?? "");
  const [category, setCategory] = React.useState<TrainingCourseCategory>(initialCourse?.category ?? "SALES");
  const [level, setLevel] = React.useState<TrainingCourseLevel>(initialCourse?.level ?? "BEGINNER");
  const [status, setStatus] = React.useState<TrainingCourseStatus>(initialCourse?.status ?? "ACTIVE");
  const [generateFromKnowledge, setGenerateFromKnowledge] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("请输入课程标题。");
      return;
    }
    if (!generateFromKnowledge && !description.trim()) {
      setError("手动保存课程时，请填写课程简介。");
      return;
    }
    if (!generateFromKnowledge && !content.trim()) {
      setError("手动保存课程时，请填写课程内容。");
      return;
    }
    setSubmitting(true);
    try {
      const course = await saveTrainingCourse({
        companyId,
        ...(initialCourse ? { courseId: initialCourse.id } : {}),
        title: title.trim(),
        description: description.trim() || undefined,
        category,
        content: generateFromKnowledge ? undefined : content.trim(),
        level,
        status,
        generateFromKnowledge
      });
      await onSaved(course);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "课程保存失败，请重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="border-indigo-200 bg-indigo-50/30">
      <CardHeader>
        <CardTitle>{initialCourse ? "编辑企业课程" : "创建企业课程"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
              课程标题
              <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} disabled={submitting} placeholder="例如：客户关系建立训练" />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              课程分类
              <select value={category} onChange={(event) => setCategory(event.target.value as TrainingCourseCategory)} disabled={submitting} className="focus-ring h-11 w-full rounded-lg border border-line bg-white px-3 text-sm shadow-sm">
                {TRAINING_COURSE_CATEGORIES.map((value) => <option key={value} value={value}>{trainingCategoryLabels[value]}</option>)}
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              课程难度
              <select value={level} onChange={(event) => setLevel(event.target.value as TrainingCourseLevel)} disabled={submitting} className="focus-ring h-11 w-full rounded-lg border border-line bg-white px-3 text-sm shadow-sm">
                {TRAINING_COURSE_LEVELS.map((value) => <option key={value} value={value}>{trainingLevelLabels[value]}</option>)}
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
              课程简介
              <Textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={3000} disabled={submitting || generateFromKnowledge} placeholder="说明学习目标与适用对象" className="min-h-24" />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
              课程内容
              <Textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={30000} disabled={submitting || generateFromKnowledge} placeholder="填写课程正文、示例与练习" className="min-h-64" />
            </label>
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-indigo-100 bg-white p-4 text-sm text-slate-700">
            <input type="checkbox" checked={generateFromKnowledge} onChange={(event) => setGenerateFromKnowledge(event.target.checked)} disabled={submitting} className="mt-1 h-4 w-4 rounded border-slate-300" />
            <span><span className="flex items-center gap-2 font-semibold text-slate-900"><Bot className="h-4 w-4 text-indigo-700" />使用企业知识生成课程</span><span className="mt-1 block leading-6 text-slate-500">AI 将生成简介和正文，并强制保存为停用草稿；请人工检查隐私、事实和合规内容后再启用。</span></span>
          </label>

          <label className="block max-w-xs space-y-2 text-sm font-medium text-slate-700">
            课程状态
            <select value={generateFromKnowledge ? "DISABLED" : status} onChange={(event) => setStatus(event.target.value as TrainingCourseStatus)} disabled={submitting || generateFromKnowledge} className="focus-ring h-11 w-full rounded-lg border border-line bg-white px-3 text-sm shadow-sm">
              <option value="ACTIVE">启用</option>
              <option value="DISABLED">停用</option>
            </select>
          </label>

          {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{error}</p> : null}
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="outline" onClick={onCancel} disabled={submitting}><X className="h-4 w-4" />取消</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : generateFromKnowledge ? <Bot className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {submitting ? generateFromKnowledge ? "AI 正在生成…" : "正在保存…" : generateFromKnowledge ? "生成停用草稿" : "保存课程"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
