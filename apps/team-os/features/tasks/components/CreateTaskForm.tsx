"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createTask } from "@/apps/team-os/features/tasks/services/task-client";
import type { TeamOption } from "@/apps/team-os/features/tasks/types";

function defaultDeadline() {
  const value = new Date(Date.now() + 24 * 60 * 60 * 1000);
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 16);
}

export function CreateTaskForm({
  teams,
  onCreated,
  onCancel
}: {
  teams: TeamOption[];
  onCreated: () => void;
  onCancel: () => void;
}) {
  const manageableTeams = teams.filter((team) => team.canManage);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [teamId, setTeamId] = React.useState(manageableTeams[0]?.id ?? "");
  const [deadline, setDeadline] = React.useState(defaultDeadline);
  const [targetCount, setTargetCount] = React.useState("5");
  const [submissionRequirements, setSubmissionRequirements] = React.useState("上传聊天截图或聊天记录，并填写本次执行总结。");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!teamId && manageableTeams[0]?.id) {
      setTeamId(manageableTeams[0].id);
    }
  }, [manageableTeams, teamId]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await createTask({
        title,
        description,
        teamId,
        deadline: new Date(deadline).toISOString(),
        targetCount: Number(targetCount),
        submissionRequirements
      });
      onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "任务创建失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="border-indigo-200 shadow-lg shadow-indigo-100/50">
      <CardHeader>
        <CardTitle className="text-lg">创建任务</CardTitle>
        <CardDescription>发布给团队全员，员工可分批提交证据推进完成进度。</CardDescription>
      </CardHeader>
      <CardContent>
        {manageableTeams.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            当前账号不是任何团队的负责人或主管，暂时不能发布任务。
          </div>
        ) : (
          <form className="grid gap-5 lg:grid-cols-2" onSubmit={handleSubmit}>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              任务名称
              <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：今日客户沟通 5 人" maxLength={120} required />
            </label>

            <label className="space-y-2 text-sm font-medium text-slate-700">
              执行团队
              <select
                value={teamId}
                onChange={(event) => setTeamId(event.target.value)}
                className="focus-ring flex h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink shadow-sm"
                required
              >
                {manageableTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </label>

            <label className="space-y-2 text-sm font-medium text-slate-700 lg:col-span-2">
              任务描述
              <Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="说明目标、执行场景和验收标准。" maxLength={5000} required />
            </label>

            <label className="space-y-2 text-sm font-medium text-slate-700">
              执行人员
              <Input value="团队全员" disabled aria-describedby="assignee-note" />
              <span id="assignee-note" className="block text-xs font-normal text-slate-500">Phase 1 按团队分配，个人指派将在后续阶段支持。</span>
            </label>

            <label className="space-y-2 text-sm font-medium text-slate-700">
              截止时间
              <Input type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} required />
            </label>

            <label className="space-y-2 text-sm font-medium text-slate-700">
              目标数量
              <Input type="number" min={1} max={10000} value={targetCount} onChange={(event) => setTargetCount(event.target.value)} required />
            </label>

            <label className="space-y-2 text-sm font-medium text-slate-700 lg:col-span-2">
              提交要求
              <Textarea value={submissionRequirements} onChange={(event) => setSubmissionRequirements(event.target.value)} maxLength={2000} required />
            </label>

            {error ? <p className="text-sm text-rose-700 lg:col-span-2" role="alert">{error}</p> : null}

            <div className="flex flex-wrap justify-end gap-3 lg:col-span-2">
              <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>取消</Button>
              <Button type="submit" disabled={submitting}>{submitting ? "创建中…" : "发布任务"}</Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
