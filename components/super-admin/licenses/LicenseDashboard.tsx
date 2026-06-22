"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, KeyRound, Loader2, ShieldOff } from "lucide-react";
import {
  disableSuperAdminLicense,
  fetchSuperAdminLicenses,
  generateSuperAdminLicenses
} from "@/lib/super-admin/license-admin-client";
import type {
  SuperAdminGeneratedLicense,
  SuperAdminLicenseAppType,
  SuperAdminLicenseDashboardData,
  SuperAdminLicenseGenerationInput,
  SuperAdminLicensePlan,
  SuperAdminLicenseRecord
} from "@/types/super-admin-licenses";
import { EmptyState, ErrorState, LoadingState } from "@/components/super-admin/common/ApiState";

const appTypeLabels: Record<SuperAdminLicenseAppType, string> = {
  user_app: "用户端",
  ingest_admin: "投喂管理员",
  super_admin: "超级管理员（兼容）"
};

const planLabels: Record<SuperAdminLicensePlan, string> = {
  free: "Free",
  pro: "Pro",
  enterprise: "Enterprise"
};

const statusLabels = {
  UNUSED: "未使用",
  USED: "已激活",
  DISABLED: "已禁用"
};

const statusClasses = {
  UNUSED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  USED: "border-sky-200 bg-sky-50 text-sky-700",
  DISABLED: "border-slate-200 bg-slate-100 text-slate-600"
};

function formatDate(value: string | null) {
  if (!value) {
    return "长期有效";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function StatusBadge({ status }: { status: SuperAdminLicenseRecord["status"] }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusClasses[status]}`}>
      {statusLabels[status]}
    </span>
  );
}

function AppTypeBadge({ appType }: { appType: SuperAdminLicenseAppType }) {
  return (
    <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
      {appTypeLabels[appType]}
    </span>
  );
}

function SummaryCards({ data }: { data: SuperAdminLicenseDashboardData }) {
  const cards = [
    ["卡密总数", data.summary.total.toLocaleString("zh-CN"), "全部 LicenseKey 记录"],
    ["未使用", data.summary.unused.toLocaleString("zh-CN"), "可被现有激活接口兑换"],
    ["已激活", data.summary.used.toLocaleString("zh-CN"), "已绑定用户账号"],
    ["即将到期", data.summary.expiringSoon.toLocaleString("zh-CN"), "30 天内到期"]
  ];

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map(([label, value, description]) => (
        <div key={label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-normal text-slate-950">{value}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        </div>
      ))}
    </section>
  );
}

function AppTypeSummary({ data }: { data: SuperAdminLicenseDashboardData }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-700">
          <KeyRound className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-normal text-slate-950">应用授权分布</h2>
          <p className="mt-1 text-sm text-slate-500">复用现有 LicenseKey，通过审计元数据区分三端用途。</p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {(Object.keys(appTypeLabels) as SuperAdminLicenseAppType[]).map((appType) => (
          <div key={appType} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-medium text-slate-500">{appTypeLabels[appType]}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{data.summary.byAppType[appType]}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function GeneratePanel({
  appType,
  title,
  prefix,
  description,
  loading,
  onGenerate
}: {
  appType: Extract<SuperAdminLicenseAppType, "user_app" | "ingest_admin">;
  title: string;
  prefix: string;
  description: string;
  loading: boolean;
  onGenerate: (input: SuperAdminLicenseGenerationInput) => Promise<void>;
}) {
  const [plan, setPlan] = useState<SuperAdminLicensePlan>("pro");
  const [count, setCount] = useState("1");
  const [expiresInDays, setExpiresInDays] = useState("365");
  const [tenantId, setTenantId] = useState("");
  const [note, setNote] = useState(title);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-normal text-slate-950">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
        </div>
        <span className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs font-semibold text-slate-600">
          {prefix}
        </span>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <label className="space-y-2 text-sm font-medium text-slate-700">
          套餐
          <select
            value={plan}
            onChange={(event) => setPlan(event.target.value as SuperAdminLicensePlan)}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800"
          >
            <option value="free">Free</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </label>
        <label className="space-y-2 text-sm font-medium text-slate-700">
          数量
          <input
            value={count}
            onChange={(event) => setCount(event.target.value)}
            inputMode="numeric"
            className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-800"
          />
        </label>
        <label className="space-y-2 text-sm font-medium text-slate-700">
          有效天数
          <input
            value={expiresInDays}
            onChange={(event) => setExpiresInDays(event.target.value)}
            inputMode="numeric"
            className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-800"
          />
        </label>
        <label className="space-y-2 text-sm font-medium text-slate-700">
          最大激活次数
          <input
            value="1"
            readOnly
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500"
          />
        </label>
        <label className="space-y-2 text-sm font-medium text-slate-700">
          企业 / 租户标识
          <input
            value={tenantId}
            onChange={(event) => setTenantId(event.target.value)}
            className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-800"
            placeholder="可为空"
          />
        </label>
        <label className="space-y-2 text-sm font-medium text-slate-700">
          备注
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-800"
            placeholder="可为空"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={() =>
          onGenerate({
            appType,
            plan,
            count: Number(count),
            expiresInDays: expiresInDays.trim() ? Number(expiresInDays) : null,
            maxActivations: 1,
            tenantId: tenantId.trim() || null,
            note: note.trim() || null
          })
        }
        disabled={loading}
        className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        生成卡密
      </button>
    </section>
  );
}

function GeneratedKeys({ generated }: { generated: SuperAdminGeneratedLicense[] }) {
  const text = useMemo(() => generated.map((item) => item.key).join("\n"), [generated]);

  if (generated.length === 0) {
    return null;
  }

  return (
    <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-normal text-emerald-950">本次生成卡密</h2>
          <p className="mt-1 text-sm text-emerald-800">明文只在本次响应显示，刷新后列表仅展示脱敏标识。</p>
        </div>
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(text)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-white px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
        >
          <Copy className="h-4 w-4" />
          复制
        </button>
      </div>
      <pre className="mt-4 max-h-72 overflow-auto rounded-lg border border-emerald-200 bg-white p-4 text-sm leading-7 text-slate-800">
        {text}
      </pre>
    </section>
  );
}

function LicenseTable({
  title,
  description,
  licenses,
  disablingId,
  onDisable
}: {
  title: string;
  description: string;
  licenses: SuperAdminLicenseRecord[];
  disablingId: string | null;
  onDisable: (id: string) => Promise<void>;
}) {
  if (licenses.length === 0) {
    return <EmptyState message={`${title}暂无卡密记录。`} />;
  }

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5">
        <h2 className="text-lg font-semibold tracking-normal text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-slate-500">
            <tr>
              <th className="px-4 py-3">卡密</th>
              <th className="px-4 py-3">应用</th>
              <th className="px-4 py-3">用途</th>
              <th className="px-4 py-3">套餐</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">到期</th>
              <th className="px-4 py-3">激活时间</th>
              <th className="px-4 py-3">激活用户</th>
              <th className="px-4 py-3">租户</th>
              <th className="px-4 py-3">备注</th>
              <th className="px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {licenses.map((license) => (
              <tr key={license.id} className="align-top">
                <td className="px-4 py-3 font-mono text-xs text-slate-700">{license.displayKey}</td>
                <td className="px-4 py-3"><AppTypeBadge appType={license.appType} /></td>
                <td className="px-4 py-3 text-slate-600">
                  {license.appType === "ingest_admin"
                    ? "管理员投喂版 Web / APK / EXE 激活"
                    : "用户端 Web / APK / EXE 激活"}
                </td>
                <td className="px-4 py-3 text-slate-700">{planLabels[license.plan]}</td>
                <td className="px-4 py-3"><StatusBadge status={license.status} /></td>
                <td className="px-4 py-3 text-slate-600">{formatDate(license.expiresAt)}</td>
                <td className="px-4 py-3 text-slate-600">{license.activatedAt ? formatDate(license.activatedAt) : "-"}</td>
                <td className="px-4 py-3 text-slate-600">{license.redeemedByUserLabel ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{license.tenantId ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600">{license.note ?? "-"}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onDisable(license.id)}
                    disabled={license.status === "DISABLED" || disablingId === license.id}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {disablingId === license.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldOff className="h-3.5 w-3.5" />}
                    禁用
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AuditPreview({ data }: { data: SuperAdminLicenseDashboardData }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold tracking-normal text-slate-950">卡密审计</h2>
      <div className="mt-4 space-y-3">
        {data.audit.length === 0 ? (
          <p className="text-sm text-slate-500">暂无卡密生成或禁用审计。</p>
        ) : (
          data.audit.map((item) => (
            <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold text-slate-900">{item.action}</p>
                <p className="text-xs text-slate-500">{formatDate(item.createdAt)}</p>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                targetId: {item.targetId ?? "-"} / operator: {item.operatorUserId ?? "-"}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export function LicenseDashboard() {
  const [data, setData] = useState<SuperAdminLicenseDashboardData | null>(null);
  const [generated, setGenerated] = useState<SuperAdminGeneratedLicense[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingAppType, setGeneratingAppType] = useState<SuperAdminLicenseAppType | null>(null);
  const [disablingId, setDisablingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setError(null);
    const nextData = await fetchSuperAdminLicenses();
    setData(nextData);
  }

  useEffect(() => {
    let mounted = true;

    fetchSuperAdminLicenses()
      .then((nextData) => {
        if (mounted) {
          setData(nextData);
          setError(null);
        }
      })
      .catch((requestError: unknown) => {
        if (mounted) {
          setError(requestError instanceof Error ? requestError.message : "卡密数据加载失败。");
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  async function handleGenerate(input: SuperAdminLicenseGenerationInput) {
    setGeneratingAppType(input.appType ?? "user_app");
    setError(null);

    try {
      const result = await generateSuperAdminLicenses(input);
      setGenerated(result.generated);
      await reload();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "卡密生成失败。");
    } finally {
      setGeneratingAppType(null);
    }
  }

  async function handleDisable(id: string) {
    setDisablingId(id);
    setError(null);

    try {
      await disableSuperAdminLicense(id);
      await reload();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "卡密禁用失败。");
    } finally {
      setDisablingId(null);
    }
  }

  if (loading) {
    return <LoadingState title="正在加载卡密授权中心" />;
  }

  if (!data) {
    return <ErrorState message={error ?? "卡密授权中心暂不可用。"} />;
  }

  const userAppLicenses = data.licenses.filter((license) => license.appType === "user_app");
  const ingestAdminLicenses = data.licenses.filter((license) => license.appType === "ingest_admin");

  return (
    <div className="space-y-6">
      {error ? <ErrorState message={error} /> : null}
      <SummaryCards data={data} />
      <div className="grid gap-6 xl:grid-cols-2">
        <GeneratePanel
          appType="user_app"
          title="用户端卡密"
          prefix="XT-USER"
          description="用于用户端 Web / Android APK / Windows EXE 注册后激活使用。"
          loading={generatingAppType === "user_app"}
          onGenerate={handleGenerate}
        />
        <GeneratePanel
          appType="ingest_admin"
          title="投喂管理员端卡密"
          prefix="XT-INGEST"
          description="用于管理员投喂版 Web / Android APK / Windows EXE 注册后激活使用。"
          loading={generatingAppType === "ingest_admin"}
          onGenerate={handleGenerate}
        />
      </div>
      <AppTypeSummary data={data} />
      <GeneratedKeys generated={generated} />
      <div className="space-y-6">
        <LicenseTable
          title="用户端卡密列表"
          description="只显示 XT-USER 用途的脱敏记录，用户端 Web / APK / EXE 可使用。"
          licenses={userAppLicenses}
          disablingId={disablingId}
          onDisable={handleDisable}
        />
        <LicenseTable
          title="投喂管理员端卡密列表"
          description="只显示 XT-INGEST 用途的脱敏记录，管理员投喂版 Web / APK / EXE 可使用。"
          licenses={ingestAdminLicenses}
          disablingId={disablingId}
          onDisable={handleDisable}
        />
      </div>
      <AuditPreview data={data} />
    </div>
  );
}
