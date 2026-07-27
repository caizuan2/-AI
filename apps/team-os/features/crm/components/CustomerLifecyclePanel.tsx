"use client";

import * as React from "react";
import { ArrowRight, CheckCircle2, GitBranch, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  CUSTOMER_LEVEL_LABELS,
  CUSTOMER_RISK_LABELS,
  CUSTOMER_STAGE_LABELS,
  formatCrmDate
} from "@/apps/team-os/features/crm/components/crm-ui";
import {
  fetchCustomerLifecycle,
  updateCustomerLifecycle
} from "@/apps/team-os/features/crm/services/crm-client";
import {
  CUSTOMER_LEVELS,
  CUSTOMER_STAGES,
  type CustomerLevel,
  type CustomerLifecycleData,
  type CustomerStage
} from "@/apps/team-os/features/crm/types";

export function CustomerLifecyclePanel({
  customerId,
  initialStage,
  initialLevel,
  onUpdated
}: {
  customerId: string;
  initialStage: CustomerStage;
  initialLevel: CustomerLevel;
  onUpdated: () => void | Promise<void>;
}) {
  const [data, setData] = React.useState<CustomerLifecycleData | null>(null);
  const [stage, setStage] = React.useState<CustomerStage>(initialStage);
  const [level, setLevel] = React.useState<CustomerLevel>(initialLevel);
  const [reason, setReason] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await fetchCustomerLifecycle(customerId);
      setData(next);
      setStage(next.stage);
      setLevel(next.level);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "客户阶段历史加载失败。");
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess(false);
    if (!reason.trim()) {
      setError("请填写调整原因。");
      return;
    }
    setSaving(true);
    try {
      const next = await updateCustomerLifecycle(customerId, {
        ...(stage !== data?.stage ? { stage } : {}),
        ...(level !== data?.level ? { level } : {}),
        reason: reason.trim()
      });
      setData(next);
      setReason("");
      setSuccess(true);
      await onUpdated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "客户阶段更新失败。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-indigo-700" aria-hidden="true" />
          客户生命周期
        </CardTitle>
        <CardDescription>阶段必须沿销售链路推进；每次调整都会保存历史事件和操作人。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? <p className="text-sm text-slate-500" role="status">正在加载阶段历史…</p> : null}
        {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{error}</p> : null}
        {success ? <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />客户阶段与等级已更新。</p> : null}

        {!loading && data?.permissions.canManage ? (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-medium text-slate-700">
                客户阶段
                <select
                  value={stage}
                  onChange={(event) => setStage(event.target.value as CustomerStage)}
                  disabled={saving}
                  className="focus-ring h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink"
                >
                  {CUSTOMER_STAGES.map((value) => <option key={value} value={value}>{CUSTOMER_STAGE_LABELS[value]}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                客户等级
                <select
                  value={level}
                  onChange={(event) => setLevel(event.target.value as CustomerLevel)}
                  disabled={saving}
                  className="focus-ring h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink"
                >
                  {CUSTOMER_LEVELS.map((value) => <option key={value} value={value}>{CUSTOMER_LEVEL_LABELS[value]}价值</option>)}
                </select>
              </label>
            </div>
            <label className="block space-y-2 text-sm font-medium text-slate-700">
              调整原因
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={saving}
                maxLength={1000}
                rows={3}
                placeholder="例如：已完成首次有效沟通，确认预算和采购时间"
                required
              />
            </label>
            <Button
              type="submit"
              disabled={saving || (stage === data.stage && level === data.level)}
              className="w-full"
            >
              {saving ? "保存中…" : "保存阶段调整"}
            </Button>
          </form>
        ) : null}

        {!loading && data ? (
          <div className="space-y-4 border-t border-slate-100 pt-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-800"><History className="h-4 w-4" aria-hidden="true" />阶段历史</p>
            {data.stageEvents.length === 0 ? <p className="text-sm text-slate-500">暂无阶段事件。</p> : (
              <ol className="space-y-3">
                {data.stageEvents.slice(0, 12).map((event) => (
                  <li key={event.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{event.fromStage ? CUSTOMER_STAGE_LABELS[event.fromStage] : "新建"}</Badge>
                      <ArrowRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                      <Badge>{CUSTOMER_STAGE_LABELS[event.toStage]}</Badge>
                    </div>
                    <p className="mt-2 break-words text-slate-700 [overflow-wrap:anywhere]">{event.reason}</p>
                    <p className="mt-2 text-xs text-slate-500">{event.changedByName} · {formatCrmDate(event.createdAt)}</p>
                  </li>
                ))}
              </ol>
            )}
            {data.scores.length > 0 ? (
              <div className="space-y-2 border-t border-slate-100 pt-4">
                <p className="text-sm font-semibold text-slate-800">等级记录</p>
                {data.scores.slice(0, 8).map((score) => (
                  <div key={score.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm">
                    <div className="flex flex-wrap gap-2"><Badge>{CUSTOMER_LEVEL_LABELS[score.level]}价值</Badge><Badge variant="warning">{CUSTOMER_RISK_LABELS[score.riskLevel]}</Badge><span className="text-slate-500">{score.score} 分</span></div>
                    <span className="text-xs text-slate-500">{formatCrmDate(score.createdAt)}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
