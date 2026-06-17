"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type SaasLicenseStatus = "unused" | "active" | "disabled" | "expired";
type SaasLicenseType = "trial" | "pro" | "enterprise" | "legacy";

type SaasLicense = {
  id: string;
  code: string;
  type: SaasLicenseType;
  status: SaasLicenseStatus;
  userId: string | null;
  tenantId: string | null;
  expiresAt: string | null;
  activatedAt: string | null;
  createdAt: string;
};

type LicenseSummary = {
  total: number;
  active: number;
  unused: number;
  expired: number;
  disabled: number;
  trial: number;
  pro: number;
  enterprise: number;
};

type StatusResponse = {
  licenses: SaasLicense[];
  summary: LicenseSummary;
};

const statusLabels: Record<SaasLicenseStatus, string> = {
  unused: "未使用",
  active: "已激活",
  disabled: "已禁用",
  expired: "已过期"
};

const typeLabels: Record<SaasLicenseType, string> = {
  trial: "试用",
  pro: "专业版",
  enterprise: "企业版",
  legacy: "旧版兼容"
};

const statusVariants: Record<SaasLicenseStatus, "default" | "secondary" | "outline" | "warning"> = {
  unused: "secondary",
  active: "default",
  disabled: "outline",
  expired: "warning"
};

function formatTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function extractErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "请求失败，请稍后重试。";
}

export function SaasLicensePanel() {
  const [licenses, setLicenses] = useState<SaasLicense[]>([]);
  const [summary, setSummary] = useState<LicenseSummary | null>(null);
  const [type, setType] = useState<SaasLicenseType>("pro");
  const [count, setCount] = useState(5);
  const [expiresAt, setExpiresAt] = useState("");
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const metrics = useMemo(() => {
    return summary ?? {
      total: licenses.length,
      active: licenses.filter((item) => item.status === "active").length,
      unused: licenses.filter((item) => item.status === "unused").length,
      expired: licenses.filter((item) => item.status === "expired").length,
      disabled: licenses.filter((item) => item.status === "disabled").length,
      trial: licenses.filter((item) => item.type === "trial").length,
      pro: licenses.filter((item) => item.type === "pro").length,
      enterprise: licenses.filter((item) => item.type === "enterprise").length
    };
  }, [licenses, summary]);

  async function loadLicenses() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/license/status?mode=admin", {
        cache: "no-store"
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.message ?? data.error?.message ?? "读取 SaaS 卡密失败。");
      }

      const payload = data.data as StatusResponse;
      setLicenses(payload.licenses ?? []);
      setSummary(payload.summary ?? null);
    } catch (fetchError) {
      setError(extractErrorMessage(fetchError));
    } finally {
      setLoading(false);
    }
  }

  async function generateLicenses() {
    setGenerating(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/license/status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type,
          count,
          expiresAt: expiresAt || null
        })
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.message ?? data.error?.message ?? "生成 SaaS 卡密失败。");
      }

      const payload = data.data as StatusResponse & { codes: string[] };
      setLicenses(payload.licenses ?? []);
      setSummary(payload.summary ?? null);
      setGeneratedCodes(payload.codes ?? []);
      setMessage(`已生成 ${payload.codes?.length ?? 0} 个 ${typeLabels[type]}卡密。`);
    } catch (fetchError) {
      setError(extractErrorMessage(fetchError));
    } finally {
      setGenerating(false);
    }
  }

  async function copyText(value: string) {
    await navigator.clipboard.writeText(value);
    setMessage("已复制到剪贴板。");
  }

  useEffect(() => {
    void loadLicenses();
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">SaaS License System</p>
          <h1 className="mt-2 text-3xl font-semibold text-ink">商业化卡密管理</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            新增 SaaS 付费入口，不替换旧卡密系统。卡密激活后作为 AI、投喂、聊天、向量化能力的统一拦截层。
          </p>
        </div>
        <Button variant="outline" onClick={loadLicenses} disabled={loading}>
          刷新
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {[
          ["总卡密", metrics.total],
          ["已激活", metrics.active],
          ["未使用", metrics.unused],
          ["企业版", metrics.enterprise]
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-xs font-semibold text-muted">{label}</p>
              <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>生成 SaaS 卡密</CardTitle>
          <CardDescription>用于商业套餐解锁。旧 `/api/license/redeem` 与旧 `/admin/licenses` 保持不变。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-[180px_140px_1fr_auto] lg:items-end">
            <label className="flex flex-col gap-2 text-sm font-medium text-ink">
              套餐
              <select
                className="focus-ring h-11 rounded-lg border border-line bg-white px-3 text-sm"
                value={type}
                onChange={(event) => setType(event.target.value as SaasLicenseType)}
              >
                <option value="trial">试用</option>
                <option value="pro">专业版</option>
                <option value="enterprise">企业版</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium text-ink">
              数量
              <Input
                min={1}
                max={200}
                type="number"
                value={count}
                onChange={(event) => setCount(Number(event.target.value))}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium text-ink">
              到期时间
              <Input
                type="datetime-local"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
            </label>
            <Button onClick={generateLicenses} disabled={generating || count < 1}>
              {generating ? "生成中" : "生成卡密"}
            </Button>
          </div>

          {error ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : null}
          {message ? (
            <div className="mt-4 rounded-lg border border-teal-100 bg-teal-50 px-4 py-3 text-sm text-teal-700">{message}</div>
          ) : null}
          {generatedCodes.length > 0 ? (
            <div className="mt-4 rounded-lg border border-line bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-ink">本次生成</p>
                <Button size="sm" variant="outline" onClick={() => copyText(generatedCodes.join("\n"))}>
                  复制全部
                </Button>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {generatedCodes.map((code) => (
                  <button
                    key={code}
                    className="focus-ring rounded-lg border border-line bg-white px-3 py-2 text-left font-mono text-xs text-ink hover:bg-teal-50"
                    onClick={() => copyText(code)}
                    type="button"
                  >
                    {code}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>卡密列表</CardTitle>
          <CardDescription>展示新增 SaaS License 表，不读取旧 Netlify Blobs 卡密。</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="rounded-lg border border-line bg-slate-50 px-4 py-10 text-center text-sm text-muted">正在读取卡密...</div>
          ) : licenses.length === 0 ? (
            <div className="rounded-lg border border-line bg-slate-50 px-4 py-10 text-center text-sm text-muted">暂无 SaaS 卡密。</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                    <th className="whitespace-nowrap px-3 py-3 font-semibold">卡密</th>
                    <th className="whitespace-nowrap px-3 py-3 font-semibold">套餐</th>
                    <th className="whitespace-nowrap px-3 py-3 font-semibold">状态</th>
                    <th className="whitespace-nowrap px-3 py-3 font-semibold">企业</th>
                    <th className="whitespace-nowrap px-3 py-3 font-semibold">用户</th>
                    <th className="whitespace-nowrap px-3 py-3 font-semibold">到期</th>
                    <th className="whitespace-nowrap px-3 py-3 font-semibold">激活</th>
                    <th className="whitespace-nowrap px-3 py-3 font-semibold">创建</th>
                    <th className="whitespace-nowrap px-3 py-3 font-semibold">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {licenses.map((license) => (
                    <tr key={license.id} className="border-b border-line/70 last:border-0">
                      <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-ink">{license.code}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-muted">{typeLabels[license.type]}</td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <Badge variant={statusVariants[license.status]}>{statusLabels[license.status]}</Badge>
                      </td>
                      <td className="max-w-[160px] truncate px-3 py-3 text-muted">{license.tenantId ?? "-"}</td>
                      <td className="max-w-[160px] truncate px-3 py-3 text-muted">{license.userId ?? "-"}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-muted">{formatTime(license.expiresAt)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-muted">{formatTime(license.activatedAt)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-muted">{formatTime(license.createdAt)}</td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <Button size="sm" variant="outline" onClick={() => copyText(license.code)}>
                          复制
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
