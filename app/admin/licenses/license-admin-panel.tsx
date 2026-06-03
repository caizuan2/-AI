"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Download, KeyRound, Loader2, Plus, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type LicenseStatus = "unused" | "used" | "disabled";

type AdminLicense = {
  display_code: string;
  status: LicenseStatus;
  created_at: string;
  expires_at: string | null;
  used_at: string | null;
  used_by: string | null;
  code_hash_prefix: string;
};

type HealthResponse = {
  ok: boolean;
  runtime?: string;
  storage?: string;
  has_LICENSE_SECRET?: boolean;
  has_ADMIN_TOKEN?: boolean;
  deploy_id?: string | null;
  site_name?: string | null;
  store_test_write_read?: boolean;
  message?: string;
};

type GenerateResponse = {
  ok: boolean;
  codes?: string[];
  expires_at?: string | null;
  message?: string;
};

type ListResponse = {
  ok: boolean;
  licenses?: AdminLicense[];
  message?: string;
};

type CheckCodeResponse = {
  ok: boolean;
  normalized_code?: string;
  code_hash_prefix?: string;
  exists?: boolean;
  status?: LicenseStatus | null;
  expires_at?: string | null;
  used_by?: string | null;
  used_at?: string | null;
  created_at?: string | null;
  display_code?: string | null;
  message?: string;
};

const ADMIN_TOKEN_STORAGE_KEY = "aikb_admin_token";

const statusLabels: Record<LicenseStatus, string> = {
  unused: "未使用",
  used: "已使用",
  disabled: "已禁用"
};

const statusVariants: Record<LicenseStatus, "default" | "secondary" | "warning"> = {
  unused: "default",
  used: "secondary",
  disabled: "warning"
};

function formatTime(value: string | null | undefined) {
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

async function readFunctionResponse<T extends { ok: boolean; message?: string }>(response: Response, fallback: string): Promise<T> {
  const data = await response.json().catch(() => null) as T | null;

  if (!response.ok || !data?.ok) {
    throw new Error(data?.message || fallback);
  }

  return data;
}

function adminHeaders(adminToken: string) {
  return {
    "Content-Type": "application/json",
    "x-admin-token": adminToken
  };
}

export function LicenseAdminPanel() {
  const [adminToken, setAdminToken] = useState("");
  const [licenses, setLicenses] = useState<AdminLicense[]>([]);
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const [generatedExpiresAt, setGeneratedExpiresAt] = useState<string | null>(null);
  const [count, setCount] = useState("10");
  const [expiresAt, setExpiresAt] = useState("");
  const [checkCode, setCheckCode] = useState("");
  const [checkResult, setCheckResult] = useState<CheckCodeResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [checkingCode, setCheckingCode] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const stats = useMemo(() => {
    return {
      total: licenses.length,
      unused: licenses.filter((item) => item.status === "unused").length,
      used: licenses.filter((item) => item.status === "used").length,
      disabled: licenses.filter((item) => item.status === "disabled").length
    };
  }, [licenses]);

  useEffect(() => {
    const savedToken = localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? "";
    setAdminToken(savedToken);

    if (savedToken) {
      void checkHealth(savedToken);
      void loadLicenses(savedToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function persistToken() {
    localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, adminToken.trim());
    setSuccess("管理员 token 已保存在当前浏览器。");
  }

  function requireToken(explicitToken?: string) {
    const token = (explicitToken ?? adminToken).trim();

    if (!token) {
      throw new Error("请先填写管理员 token。");
    }

    return token;
  }

  async function checkHealth(explicitToken?: string) {
    setCheckingHealth(true);
    setError("");

    try {
      const token = requireToken(explicitToken);
      const response = await fetch("/api/admin/health", {
        method: "POST",
        headers: adminHeaders(token),
        body: "{}"
      });
      const data = await readFunctionResponse<HealthResponse>(response, "健康检查失败。");
      setHealth(data);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "健康检查失败。");
      setHealth(null);
    } finally {
      setCheckingHealth(false);
    }
  }

  async function loadLicenses(explicitToken?: string) {
    setLoading(true);
    setError("");

    try {
      const token = requireToken(explicitToken);
      const response = await fetch("/api/admin/list?limit=200", {
        headers: {
          "x-admin-token": token
        }
      });
      const data = await readFunctionResponse<ListResponse>(response, "加载卡密失败。");
      setLicenses(data.licenses ?? []);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "加载卡密失败。");
    } finally {
      setLoading(false);
    }
  }

  async function generateLicenses() {
    setGenerating(true);
    setError("");
    setSuccess("");

    try {
      const token = requireToken();
      const response = await fetch("/api/admin/generate", {
        method: "POST",
        headers: adminHeaders(token),
        body: JSON.stringify({
          count: Number(count),
          expires_at: expiresAt ? new Date(`${expiresAt}T23:59:59.000+08:00`).toISOString() : null
        })
      });
      const data = await readFunctionResponse<GenerateResponse>(response, "生成卡密失败。");

      setGeneratedCodes(data.codes ?? []);
      setGeneratedExpiresAt(data.expires_at ?? null);
      setSuccess(`已生成 ${data.codes?.length ?? 0} 个卡密，请立即保存明文。`);
      await loadLicenses(token);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "生成卡密失败。");
    } finally {
      setGenerating(false);
    }
  }

  async function checkLicenseCode() {
    setCheckingCode(true);
    setError("");
    setCheckResult(null);

    try {
      const token = requireToken();
      const response = await fetch("/api/admin/check-code", {
        method: "POST",
        headers: adminHeaders(token),
        body: JSON.stringify({ code: checkCode })
      });
      const data = await readFunctionResponse<CheckCodeResponse>(response, "查询卡密失败。");
      setCheckResult(data);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "查询卡密失败。");
    } finally {
      setCheckingCode(false);
    }
  }

  async function copyGeneratedCodes() {
    if (generatedCodes.length === 0) {
      return;
    }

    await navigator.clipboard.writeText(generatedCodes.join("\n"));
    setSuccess("已复制本批明文卡密。");
  }

  async function copyCode(code: string) {
    await navigator.clipboard.writeText(code);
    setSuccess("已复制卡密。");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Netlify Blobs License"
        title="卡密管理"
        description="卡密生成、查询、激活全部走同一个 Netlify 站点内的 Functions + Blobs。"
      >
        <Link
          href="/admin"
          className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          返回后台
        </Link>
        <Button variant="outline" onClick={() => loadLicenses()} disabled={loading}>
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

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-teal-50 text-teal-700">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <CardTitle>管理员 token</CardTitle>
              <CardDescription>token 只保存在当前浏览器 localStorage，不写入前端构建产物。</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
            <Input
              value={adminToken}
              onChange={(event) => setAdminToken(event.target.value)}
              type="password"
              autoComplete="off"
              placeholder="输入 Netlify 环境变量 ADMIN_TOKEN"
            />
            <Button variant="secondary" onClick={persistToken}>保存 token</Button>
            <Button onClick={() => checkHealth()} disabled={checkingHealth}>
              {checkingHealth ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              检查连接
            </Button>
          </div>
          {health ? (
            <div className="grid gap-3 rounded-lg border border-line bg-canvas p-4 text-sm md:grid-cols-4">
              <div>
                <p className="text-muted">Runtime</p>
                <p className="font-semibold text-ink">{health.runtime ?? "-"}</p>
              </div>
              <div>
                <p className="text-muted">Storage</p>
                <p className="font-semibold text-ink">{health.storage ?? "-"}</p>
              </div>
              <div>
                <p className="text-muted">Secret</p>
                <p className="font-semibold text-ink">{health.has_LICENSE_SECRET ? "已配置" : "缺失"}</p>
              </div>
              <div>
                <p className="text-muted">Blobs 写读</p>
                <p className="font-semibold text-ink">{health.store_test_write_read ? "正常" : "异常"}</p>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>最近卡密</CardDescription>
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
          <CardDescription>生成的新卡密会写入 Netlify Blobs，同站激活页可立即使用。</CardDescription>
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
                  复制全部
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
                <div key={code} className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2">
                  <span>{code}</span>
                  <Button size="sm" variant="outline" onClick={() => copyCode(code)}>
                    <Copy className="h-4 w-4" />
                    复制
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>检查卡密</CardTitle>
          <CardDescription>用于确认某个明文卡密是否已写入线上 Netlify Blobs。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <Input
              value={checkCode}
              onChange={(event) => setCheckCode(event.target.value)}
              className="uppercase"
              placeholder="AIKB-XXXX-XXXX-XXXX"
            />
            <Button onClick={checkLicenseCode} disabled={checkingCode}>
              {checkingCode ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              查询
            </Button>
          </div>
          {checkResult ? (
            <div className="rounded-lg border border-line bg-canvas p-4 text-sm">
              <p className="font-semibold text-ink">
                {checkResult.exists ? "卡密存在" : "卡密不存在"}
              </p>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                <p><span className="text-muted">规范化：</span>{checkResult.normalized_code ?? "-"}</p>
                <p><span className="text-muted">状态：</span>{checkResult.status ? statusLabels[checkResult.status] : "-"}</p>
                <p><span className="text-muted">hash 前缀：</span>{checkResult.code_hash_prefix ?? "-"}</p>
                <p><span className="text-muted">有效期：</span>{formatTime(checkResult.expires_at)}</p>
                <p><span className="text-muted">使用者：</span>{checkResult.used_by ?? "-"}</p>
                <p><span className="text-muted">使用时间：</span>{formatTime(checkResult.used_at)}</p>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-teal-50 text-teal-700">
              <KeyRound className="h-5 w-5" />
            </span>
            <div>
              <CardTitle>最近卡密</CardTitle>
              <CardDescription>列表来自 Netlify Blobs，最多显示最近 200 条。</CardDescription>
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
              还没有线上卡密，先生成一批。
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-line text-xs uppercase text-muted">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-3 font-semibold">卡密</th>
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
                    <tr key={`${license.code_hash_prefix}-${license.created_at}`}>
                      <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-ink">{license.display_code}</td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <Badge variant={statusVariants[license.status]}>{statusLabels[license.status]}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-muted">{formatTime(license.expires_at)}</td>
                      <td className="max-w-[180px] truncate px-3 py-3 text-muted">{license.used_by ?? "-"}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-muted">{formatTime(license.used_at)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-muted">{formatTime(license.created_at)}</td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <Button size="sm" variant="outline" onClick={() => copyCode(license.display_code)}>
                          <Copy className="h-4 w-4" />
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
