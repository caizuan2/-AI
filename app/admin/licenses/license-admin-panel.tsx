"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Ban, Copy, Download, KeyRound, Loader2, Plus, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { unwrapApiResponse } from "@/lib/api/client";

type LicenseStatus = "UNUSED" | "USED" | "DISABLED";

type AdminLicense = {
  id: string;
  status: LicenseStatus;
  redeemedByUserId: string | null;
  redeemedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

type ListAdminLicensesResponse = {
  licenses: AdminLicense[];
};

type GenerateAdminLicensesResponse = {
  codes: string[];
  expiresAt: string | null;
};

const statusLabels: Record<LicenseStatus, string> = {
  UNUSED: "未使用",
  USED: "已使用",
  DISABLED: "已禁用"
};

const statusVariants: Record<LicenseStatus, "default" | "secondary" | "warning"> = {
  UNUSED: "default",
  USED: "secondary",
  DISABLED: "warning"
};

function formatTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("zh-CN");
}

function buildCsv(codes: string[], expiresAt: string | null) {
  const rows = [["code", "expiresAt"], ...codes.map((code) => [code, expiresAt ?? ""])];
  return rows.map((row) => row.map((item) => `"${item.replaceAll("\"", "\"\"")}"`).join(",")).join("\n");
}

function downloadCsv(codes: string[], expiresAt: string | null) {
  const blob = new Blob([buildCsv(codes, expiresAt)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "license-codes.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function LicenseAdminPanel() {
  const [licenses, setLicenses] = useState<AdminLicense[]>([]);
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const [generatedExpiresAt, setGeneratedExpiresAt] = useState<string | null>(null);
  const [count, setCount] = useState("10");
  const [expiresAt, setExpiresAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [disablingId, setDisablingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const stats = useMemo(() => {
    return {
      total: licenses.length,
      unused: licenses.filter((item) => item.status === "UNUSED").length,
      used: licenses.filter((item) => item.status === "USED").length,
      disabled: licenses.filter((item) => item.status === "DISABLED").length
    };
  }, [licenses]);

  async function loadLicenses() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/licenses");
      const data = await unwrapApiResponse<ListAdminLicensesResponse>(response, "加载卡密失败。");
      setLicenses(data.licenses);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "加载卡密失败。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLicenses();
  }, []);

  async function generateLicenses() {
    setGenerating(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/admin/licenses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          count: Number(count),
          expiresAt
        })
      });
      const data = await unwrapApiResponse<GenerateAdminLicensesResponse>(response, "生成卡密失败。");

      setGeneratedCodes(data.codes);
      setGeneratedExpiresAt(data.expiresAt);
      setSuccess(`已生成 ${data.codes.length} 个卡密，请立即保存明文。`);
      await loadLicenses();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "生成卡密失败。");
    } finally {
      setGenerating(false);
    }
  }

  async function disableLicense(id: string) {
    if (!window.confirm("确认禁用这条未使用卡密？")) {
      return;
    }

    setDisablingId(id);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`/api/admin/licenses/${id}/disable`, {
        method: "POST"
      });

      await unwrapApiResponse<unknown>(response, "禁用卡密失败。");
      setSuccess("卡密已禁用。");
      await loadLicenses();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "禁用卡密失败。");
    } finally {
      setDisablingId(null);
    }
  }

  async function copyGeneratedCodes() {
    if (generatedCodes.length === 0) {
      return;
    }

    await navigator.clipboard.writeText(generatedCodes.join("\n"));
    setSuccess("已复制本批明文卡密。");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="License"
        title="卡密管理"
        description="这里生成的卡密会直接写入 Supabase，可在激活页立即使用。"
      >
        <Link
          href="/admin"
          className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          返回后台
        </Link>
        <Button variant="outline" onClick={loadLicenses} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          刷新
        </Button>
      </PageHeader>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>卡密总数</CardDescription>
            <CardTitle className="text-3xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>未使用</CardDescription>
            <CardTitle className="text-3xl">{stats.unused}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>已使用</CardDescription>
            <CardTitle className="text-3xl">{stats.used}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>已禁用</CardDescription>
            <CardTitle className="text-3xl">{stats.disabled}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>批量生成</CardTitle>
          <CardDescription>明文只显示一次，数据库只保存 hash。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-[160px_220px_auto] md:items-end">
            <label className="grid gap-2 text-sm font-medium text-ink">
              数量
              <Input type="number" min={1} max={5000} value={count} onChange={(event) => setCount(event.target.value)} />
            </label>
            <label className="grid gap-2 text-sm font-medium text-ink">
              有效期
              <Input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
            </label>
            <Button onClick={generateLicenses} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              生成卡密
            </Button>
          </div>
        </CardContent>
      </Card>

      {generatedCodes.length > 0 ? (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle>本批明文卡密</CardTitle>
                <CardDescription>请立即复制或下载，刷新后无法恢复明文。</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={copyGeneratedCodes}>
                  <Copy className="h-4 w-4" />
                  复制
                </Button>
                <Button variant="secondary" onClick={() => downloadCsv(generatedCodes, generatedExpiresAt)}>
                  <Download className="h-4 w-4" />
                  下载 CSV
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 rounded-lg border border-line bg-canvas p-4 font-mono text-sm">
              {generatedCodes.map((code) => (
                <div key={code}>{code}</div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-teal-50 text-teal-700">
              <KeyRound className="h-5 w-5" />
            </span>
            <div>
              <CardTitle>卡密列表</CardTitle>
              <CardDescription>为了安全，历史卡密不展示明文。</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex min-h-[220px] items-center justify-center text-sm text-muted">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加载卡密中
            </div>
          ) : licenses.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line bg-canvas px-4 py-10 text-center text-sm text-muted">
              还没有卡密，先生成一批。
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-line text-xs uppercase text-muted">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-3 font-semibold">ID</th>
                    <th className="whitespace-nowrap px-3 py-3 font-semibold">状态</th>
                    <th className="whitespace-nowrap px-3 py-3 font-semibold">有效期</th>
                    <th className="whitespace-nowrap px-3 py-3 font-semibold">使用者</th>
                    <th className="whitespace-nowrap px-3 py-3 font-semibold">使用时间</th>
                    <th className="whitespace-nowrap px-3 py-3 font-semibold">创建时间</th>
                    <th className="whitespace-nowrap px-3 py-3 font-semibold">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {licenses.map((license) => (
                    <tr key={license.id}>
                      <td className="max-w-[180px] truncate px-3 py-3 font-mono text-xs text-muted">{license.id}</td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <Badge variant={statusVariants[license.status]}>{statusLabels[license.status]}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-muted">{formatTime(license.expiresAt)}</td>
                      <td className="max-w-[180px] truncate px-3 py-3 text-muted">{license.redeemedByUserId ?? "-"}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-muted">{formatTime(license.redeemedAt)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-muted">{formatTime(license.createdAt)}</td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {license.status === "UNUSED" ? (
                          <Button size="sm" variant="outline" onClick={() => disableLicense(license.id)} disabled={disablingId === license.id}>
                            {disablingId === license.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                            禁用
                          </Button>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
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
