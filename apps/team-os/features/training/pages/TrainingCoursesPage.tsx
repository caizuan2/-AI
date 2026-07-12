"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Edit3, Play, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TrainingCompanySelector } from "@/apps/team-os/features/training/components/TrainingCompanySelector";
import { TrainingCourseCard } from "@/apps/team-os/features/training/components/TrainingCourseCard";
import { TrainingCourseForm } from "@/apps/team-os/features/training/components/TrainingCourseForm";
import { TrainingSectionNavigation } from "@/apps/team-os/features/training/components/TrainingSectionNavigation";
import { TrainingEmptyState, TrainingErrorState, TrainingLoadingState } from "@/apps/team-os/features/training/components/TrainingState";
import { trainingCategoryLabels, trainingLevelLabels } from "@/apps/team-os/features/training/components/TrainingBadges";
import { useTrainingCourses } from "@/apps/team-os/features/training/hooks/useTrainingCourses";
import { startTrainingCourse } from "@/apps/team-os/features/training/services/training-client";
import {
  TRAINING_COURSE_CATEGORIES,
  TRAINING_COURSE_LEVELS,
  type TrainingCourseCategory,
  type TrainingCourseLevel,
  type TrainingCourseListFilters,
  type TrainingCourseRecord,
  type TrainingCourseStatus
} from "@/apps/team-os/features/training/types";

export function TrainingCoursesPage({ initialCourseId }: { initialCourseId?: string }) {
  const router = useRouter();
  const [filters, setFilters] = React.useState<TrainingCourseListFilters>({});
  const [search, setSearch] = React.useState("");
  const [expandedId, setExpandedId] = React.useState<string | null>(initialCourseId ?? null);
  const [editing, setEditing] = React.useState<TrainingCourseRecord | "new" | null>(null);
  const [startingId, setStartingId] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const courses = useTrainingCourses(filters);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((current) => current.search === search.trim() ? current : { ...current, search: search.trim() || undefined });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  async function handleSaved(course: TrainingCourseRecord) {
    setEditing(null);
    setExpandedId(course.id);
    setNotice(course.status === "DISABLED"
      ? `课程“${course.title}”已保存为停用草稿，请审核后再启用。`
      : `课程“${course.title}”已保存。`);
    await courses.reload();
  }

  async function handleStart(courseId: string) {
    setStartingId(courseId);
    setActionError(null);
    try {
      await startTrainingCourse(courseId);
      router.push(`/team-os/training/simulation?courseId=${encodeURIComponent(courseId)}`);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "课程启动失败，请重试。");
      setStartingId(null);
    }
  }

  const data = courses.data;
  const editor = editing === "new" ? undefined : editing ?? undefined;
  const hasFilters = Boolean(filters.search || filters.category || filters.level || filters.status);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-medium text-indigo-700">企业课程库</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">课程中心</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">学习文字课程、企业知识课程与销售 SOP，也可由培训师结合企业知识生成新课程。</p></div>{data?.context.permissions.canCreateCourse && !editing ? <Button onClick={() => { setNotice(null); setEditing("new"); }}><Plus className="h-4 w-4" />创建课程</Button> : null}</div>
      <TrainingSectionNavigation />

      {data ? <TrainingCompanySelector companyId={data.context.companyId} companyName={data.context.companyName} companies={data.context.companies} disabled={courses.loading || Boolean(editing)} onChange={(companyId) => { setEditing(null); setExpandedId(null); setSearch(""); setFilters({ companyId }); }} /> : null}
      {editing && data?.context.permissions.canCreateCourse ? <TrainingCourseForm key={editor?.id ?? "new"} companyId={data.context.companyId} initialCourse={editor} onSaved={handleSaved} onCancel={() => setEditing(null)} /> : null}
      {notice ? <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status"><CheckCircle2 className="h-4 w-4" />{notice}</p> : null}
      {courses.error && data ? <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">{courses.error.message}</p> : null}
      {actionError ? <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">{actionError}</p> : null}

      {courses.loading ? <TrainingLoadingState label="正在加载企业课程…" /> : courses.error && !data ? <TrainingErrorState message={courses.error.message} onRetry={() => void courses.reload()} /> : !data ? <TrainingEmptyState title="课程数据暂不可用" description="请确认当前账号已加入有效企业团队。" /> : (
        <>
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
            <label className="relative sm:col-span-2"><span className="sr-only">搜索课程</span><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="搜索课程标题或简介" /></label>
            <label><span className="sr-only">课程分类</span><select value={filters.category ?? ""} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value as TrainingCourseCategory || undefined }))} className="focus-ring h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"><option value="">全部分类</option>{TRAINING_COURSE_CATEGORIES.map((value) => <option key={value} value={value}>{trainingCategoryLabels[value]}</option>)}</select></label>
            <label><span className="sr-only">课程难度</span><select value={filters.level ?? ""} onChange={(event) => setFilters((current) => ({ ...current, level: event.target.value as TrainingCourseLevel || undefined }))} className="focus-ring h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"><option value="">全部难度</option>{TRAINING_COURSE_LEVELS.map((value) => <option key={value} value={value}>{trainingLevelLabels[value]}</option>)}</select></label>
            {data.context.permissions.canEditCourse ? <label><span className="sr-only">课程状态</span><select value={filters.status ?? ""} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as TrainingCourseStatus || undefined }))} className="focus-ring h-11 w-full rounded-lg border border-line bg-white px-3 text-sm"><option value="">全部状态</option><option value="ACTIVE">启用</option><option value="DISABLED">停用</option></select></label> : <Button variant="outline" onClick={() => { setSearch(""); setFilters({ companyId: data.context.companyId }); }} disabled={!hasFilters}>清除筛选</Button>}
          </div>
          <p className="text-sm text-slate-500">共 {data.total} 门课程</p>
          {data.truncated ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="status">当前筛选结果超过展示上限，页面仅展示最近更新的 200 门课程。请使用搜索和分类筛选定位其他课程。</p> : null}
          {data.items.length === 0 ? <TrainingEmptyState title={hasFilters ? "没有符合条件的课程" : "企业课程库为空"} description={hasFilters ? "调整搜索或筛选条件后重试。" : data.context.permissions.canCreateCourse ? "创建第一门企业课程，开始沉淀培训内容。" : "请等待企业负责人或培训师发布课程。"} action={hasFilters ? <Button variant="outline" onClick={() => { setSearch(""); setFilters({ companyId: data.context.companyId }); }}>清除筛选</Button> : undefined} /> : (
            <div className="grid items-start gap-5 lg:grid-cols-2">
              {data.items.map((course) => <TrainingCourseCard key={course.id} course={course} expanded={expandedId === course.id} onToggle={() => setExpandedId((current) => current === course.id ? null : course.id)} actions={<>{data.context.permissions.canEditCourse ? <Button variant="outline" size="sm" onClick={() => { setNotice(null); setEditing(course); }}><Edit3 className="h-4 w-4" />编辑</Button> : null}{course.status === "ACTIVE" ? <Button size="sm" onClick={() => void handleStart(course.id)} disabled={startingId === course.id}><Play className="h-4 w-4" />{startingId === course.id ? "启动中…" : "学习并训练"}</Button> : null}</>} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
