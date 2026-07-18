"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { INDUSTRY_COACH_SKILLS } from "@/apps/team-os/features/industry-coach/components/industry-coach-ui";
import { createCoachRule } from "@/apps/team-os/features/industry-coach/services/industry-coach-client";
import type { CoachRuleRules, IndustryCoachSkillKey } from "@/apps/team-os/features/industry-coach/types";

const EMPTY_CRITERIA: Record<IndustryCoachSkillKey, string> = {
  ice_breaking: "是否建立关系\n是否了解客户背景",
  needs_discovery: "是否发现客户痛点\n是否提出有效问题",
  product_presentation: "是否结合客户需求介绍产品价值",
  objection_handling: "是否正确处理价格、效果与信任问题",
  closing_progress: "是否形成明确的下一步行动"
};

function parseCriteria(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

export function CoachRuleForm({ companyId, onCreated, onCancel }: { companyId: string; onCreated: () => void | Promise<void>; onCancel: () => void }) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [criteria, setCriteria] = React.useState<Record<IndustryCoachSkillKey, string>>(() => ({ ...EMPTY_CRITERIA }));
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    const dimensions = {} as CoachRuleRules["dimensions"];
    for (const skill of INDUSTRY_COACH_SKILLS) {
      const entries = parseCriteria(criteria[skill.key]);
      if (entries.length < 1 || entries.length > 12) {
        setError(`${skill.label}必须填写 1 到 12 条评分标准，每行一条。`);
        return;
      }
      if (entries.some((entry) => entry.length > 300)) {
        setError(`${skill.label}的单条评分标准不能超过 300 个字符。`);
        return;
      }
      dimensions[skill.key] = { weight: 20, criteria: entries };
    }

    setSubmitting(true);
    try {
      await createCoachRule({
        companyId,
        name: name.trim(),
        description: description.trim(),
        rules: { schemaVersion: 1, dimensions }
      });
      await onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "评分规则创建失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="border-indigo-200 shadow-lg shadow-indigo-100/50">
      <CardHeader>
        <CardTitle>新增评分规则</CardTitle>
        <CardDescription>五项销售能力固定各占 20 分；每个文本框一行代表一条评分依据。</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-5 md:grid-cols-2" onSubmit={handleSubmit} aria-busy={submitting}>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            规则名称
            <Input value={name} onChange={(event) => setName(event.target.value)} disabled={submitting} maxLength={120} placeholder="例如：企业销售沟通评分规则" autoFocus required />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            规则说明（可选）
            <Input value={description} onChange={(event) => setDescription(event.target.value)} disabled={submitting} maxLength={2000} placeholder="说明适用场景或版本。" />
          </label>

          {INDUSTRY_COACH_SKILLS.map((skill, index) => (
            <label key={skill.key} className={`space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-700 ${index === INDUSTRY_COACH_SKILLS.length - 1 ? "md:col-span-2" : ""}`}>
              <span className="flex flex-wrap items-center justify-between gap-2"><span>{skill.label}</span><span className="text-xs font-normal text-indigo-700">权重 20 分</span></span>
              <span className="block text-xs font-normal leading-5 text-slate-500">{skill.hint}；每行一条，最多 12 条。</span>
              <Textarea
                value={criteria[skill.key]}
                onChange={(event) => setCriteria((current) => ({ ...current, [skill.key]: event.target.value }))}
                disabled={submitting}
                maxLength={4000}
                rows={4}
                required
              />
            </label>
          ))}

          {error ? <p className="break-words text-sm text-rose-700 [overflow-wrap:anywhere] md:col-span-2" role="alert">{error}</p> : null}
          <div className="flex flex-wrap justify-end gap-3 md:col-span-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>取消</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "创建中…" : "保存评分规则"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
