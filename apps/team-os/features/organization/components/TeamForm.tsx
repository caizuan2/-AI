"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createTeam, updateTeam } from "@/apps/team-os/features/organization/services/organization-client";
import type { OrganizationCompanyOption, OrganizationTeam } from "@/apps/team-os/features/organization/types";

export function TeamForm({ team, companies, onSaved, onCancel }: { team?: OrganizationTeam; companies: OrganizationCompanyOption[]; onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = React.useState(team?.name ?? "");
  const [description, setDescription] = React.useState(team?.description ?? "");
  const [companyId, setCompanyId] = React.useState(companies[0]?.id ?? "");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setName(team?.name ?? "");
    setDescription(team?.description ?? "");
    setCompanyId(team?.companyId ?? companies[0]?.id ?? "");
  }, [companies, team]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (team) {
        await updateTeam({
          teamId: team.id,
          name,
          description
        });
      } else {
        await createTeam({ name, description, ...(companyId ? { companyId } : {}) });
      }
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "团队保存失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="border-indigo-200 shadow-lg shadow-indigo-100/50">
      <CardHeader>
        <CardTitle>{team ? "编辑团队" : "创建团队"}</CardTitle>
        <CardDescription>{team ? "更新团队名称和职责描述。" : "创建后当前账号将成为该团队负责人。"}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-5 md:grid-cols-2" onSubmit={handleSubmit}>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            团队名称
            <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="例如：华东销售一组" required />
          </label>

          {!team && companies.length > 1 ? (
            <label className="space-y-2 text-sm font-medium text-slate-700">
              所属企业
              <select value={companyId} onChange={(event) => setCompanyId(event.target.value)} className="focus-ring flex h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink shadow-sm">
                {companies.map((company) => <option key={company.id} value={company.id}>{company.name} · {company.id}</option>)}
              </select>
            </label>
          ) : null}

          <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
            团队描述
            <Textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} placeholder="说明团队职责、区域或业务目标。" />
          </label>

          {error ? <p className="text-sm text-rose-700 md:col-span-2" role="alert">{error}</p> : null}

          <div className="flex justify-end gap-3 md:col-span-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>取消</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "保存中…" : "保存团队"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
