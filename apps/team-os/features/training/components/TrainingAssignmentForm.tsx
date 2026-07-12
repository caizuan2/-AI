"use client";

import * as React from "react";
import { CalendarClock, LoaderCircle, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createTrainingAssignment } from "@/apps/team-os/features/training/services/training-client";
import type {
  TrainingAssignmentItem,
  TrainingCourseRecord,
  TrainingMemberOption
} from "@/apps/team-os/features/training/types";

function initialDeadline() {
  const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function memberOptionKey(member: TrainingMemberOption) {
  return `${member.teamId}:${member.id}`;
}

export function TrainingAssignmentForm({
  courses,
  members,
  onCreated
}: {
  courses: TrainingCourseRecord[];
  members: TrainingMemberOption[];
  onCreated: (assignment: TrainingAssignmentItem) => void | Promise<void>;
}) {
  const activeCourses = courses.filter((course) => course.status === "ACTIVE");
  const [courseId, setCourseId] = React.useState(activeCourses[0]?.id ?? "");
  const [memberKey, setMemberKey] = React.useState(
    members[0] ? memberOptionKey(members[0]) : ""
  );
  const [deadline, setDeadline] = React.useState(initialDeadline);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!activeCourses.some((course) => course.id === courseId)) setCourseId(activeCourses[0]?.id ?? "");
  }, [activeCourses, courseId]);

  React.useEffect(() => {
    if (!members.some((member) => memberOptionKey(member) === memberKey)) {
      setMemberKey(members[0] ? memberOptionKey(members[0]) : "");
    }
  }, [memberKey, members]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const member = members.find((item) => memberOptionKey(item) === memberKey);
    const parsedDeadline = new Date(deadline);
    if (!courseId || !member) {
      setError("请选择课程和员工。");
      return;
    }
    if (!Number.isFinite(parsedDeadline.getTime()) || parsedDeadline.getTime() <= Date.now()) {
      setError("截止时间必须晚于当前时间。");
      return;
    }
    setSubmitting(true);
    try {
      const assignment = await createTrainingAssignment({
        courseId,
        teamId: member.teamId,
        userId: member.id,
        deadline: parsedDeadline.toISOString()
      });
      await onCreated(assignment);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "培训安排失败，请重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="border-indigo-200 bg-indigo-50/30">
      <CardHeader><CardTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-indigo-700" />安排员工培训</CardTitle></CardHeader>
      <CardContent>
        {activeCourses.length === 0 || members.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm leading-6 text-slate-500">{activeCourses.length === 0 ? "请先创建并启用至少一门课程。" : "当前管理范围内没有可安排培训的有效成员。"}</p>
        ) : (
          <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={handleSubmit}>
            <label className="space-y-2 text-sm font-medium text-slate-700 xl:col-span-2">培训课程<select value={courseId} onChange={(event) => setCourseId(event.target.value)} disabled={submitting} className="focus-ring h-11 w-full rounded-lg border border-line bg-white px-3 text-sm shadow-sm">{activeCourses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label>
            <label className="space-y-2 text-sm font-medium text-slate-700">执行员工<select value={memberKey} onChange={(event) => setMemberKey(event.target.value)} disabled={submitting} className="focus-ring h-11 w-full rounded-lg border border-line bg-white px-3 text-sm shadow-sm">{members.map((member) => <option key={memberOptionKey(member)} value={memberOptionKey(member)}>{member.name} · {member.teamName}</option>)}</select></label>
            <label className="space-y-2 text-sm font-medium text-slate-700">截止时间<Input type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} disabled={submitting} /></label>
            {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 md:col-span-2 xl:col-span-3" role="alert">{error}</p> : <span className="hidden xl:block xl:col-span-3" />}
            <Button type="submit" disabled={submitting} className="self-end">{submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}{submitting ? "正在安排…" : "确认安排"}</Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
