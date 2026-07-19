"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Network, PackageCheck, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TenantCompanySelector } from "@/apps/team-os/features/tenant/components/TenantCompanySelector";
import { TenantPageHeader } from "@/apps/team-os/features/tenant/components/TenantPageHeader";
import { TenantSectionNavigation } from "@/apps/team-os/features/tenant/components/TenantSectionNavigation";
import {
  TenantErrorState,
  TenantForbiddenState,
  TenantLoadingState
} from "@/apps/team-os/features/tenant/components/TenantState";
import { useTenantCompany } from "@/apps/team-os/features/tenant/hooks/useTenantData";
import { formatTenantDate, tenantStatusLabel } from "@/apps/team-os/features/tenant/utils/tenant-format";

function safeLogoBackground(logo: string | null) {
  if (!logo) return undefined;
  try {
    if (logo.startsWith("//")) return undefined;
    const url = logo.startsWith("/") ? logo : new URL(logo);
    if (typeof url !== "string" && !["http:", "https:"].includes(url.protocol)) return undefined;
    return { backgroundImage: `url(${JSON.stringify(typeof url === "string" ? url : url.toString())})` };
  } catch {
    return undefined;
  }
}

export function CompanyCenterPage({ initialCompanyId }: { initialCompanyId?: string }) {
  const router = useRouter();
  const resource = useTenantCompany(initialCompanyId);
  const data = resource.data;
  const activeCompanyId = resource.companyId ?? data?.context.companyId;

  const handleCompanyChange = React.useCallback((companyId: string) => {
    resource.selectCompany(companyId);
    router.replace(`/team-os/company?companyId=${encodeURIComponent(companyId)}`, { scroll: false });
  }, [resource, router]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <TenantPageHeader
        eyebrow="Enterprise Center"
        title="企业中心"
        description="集中查看企业资料、成员规模、当前套餐与商业化状态。企业数据始终按当前账号的有效成员关系隔离。"
      />
      <TenantSectionNavigation companyId={activeCompanyId} />

      {resource.loading ? <TenantLoadingState label="正在读取企业信息…" /> : resource.error?.code === "FORBIDDEN" ? (
        <TenantForbiddenState description="只有当前企业的有效成员可以查看企业资料；套餐和企业级使用量由企业负责人管理。" />
      ) : resource.error ? (
        <TenantErrorState message={resource.error.message} onRetry={() => void resource.reload()} />
      ) : data ? (
        <>
          <TenantCompanySelector
            companyId={data.context.companyId}
            companyName={data.context.companyName}
            companies={data.context.companies}
            onChange={handleCompanyChange}
          />

          {!data.company.provisioned ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900" role="note">
              <p className="font-semibold">企业商业化资料待初始化</p>
              <p className="mt-1">当前仅展示由组织成员关系安全推导的企业信息；请联系平台授权方初始化商业化资料和套餐。</p>
            </div>
          ) : null}

          <Card className="overflow-hidden border-slate-200">
            <CardContent className="flex min-w-0 flex-col gap-6 p-6 sm:flex-row sm:items-center">
              <span
                className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-600 to-slate-900 bg-cover bg-center text-2xl font-semibold text-white shadow-lg shadow-indigo-100"
                style={safeLogoBackground(data.company.logo)}
                role="img"
                aria-label={`${data.company.name} 企业标识`}
              >
                {safeLogoBackground(data.company.logo) ? null : data.company.name.trim().slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="break-words text-2xl font-semibold text-slate-950">{data.company.name}</h2>
                  <Badge variant={data.company.status === "ACTIVE" ? "default" : "warning"}>
                    {tenantStatusLabel(data.company.status)}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-slate-500">{data.company.industry || "行业信息待完善"}</p>
                <p className="mt-2 break-all text-xs text-slate-400">企业 ID：{data.company.id}</p>
              </div>
              <Link
                href={`/team-os/organization/members?companyId=${encodeURIComponent(data.context.companyId)}`}
                className="focus-ring inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                查看成员
              </Link>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "企业成员", value: data.company.memberCount, suffix: "人", icon: UsersRound },
              { label: "有效团队", value: data.company.teamCount, suffix: "个", icon: Network },
              { label: "当前套餐", value: data.company.currentPlan?.name ?? "暂未开通", suffix: "", icon: PackageCheck },
              { label: "加入平台", value: formatTenantDate(data.company.createdAt), suffix: "", icon: CalendarDays }
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.label}>
                  <CardContent className="flex h-full min-w-0 items-start gap-3 p-5">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-500">{item.label}</p>
                      <p className="mt-1 break-words text-xl font-semibold text-slate-950">{item.value}{item.suffix}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>企业资料</CardTitle>
                <CardDescription>企业主体的基础信息与更新时间。</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
                <div><p className="text-xs text-slate-500">企业名称</p><p className="mt-1 break-words font-medium">{data.company.name}</p></div>
                <div><p className="text-xs text-slate-500">所属行业</p><p className="mt-1 break-words font-medium">{data.company.industry || "待完善"}</p></div>
                <div><p className="text-xs text-slate-500">创建日期</p><p className="mt-1 font-medium">{formatTenantDate(data.company.createdAt)}</p></div>
                <div><p className="text-xs text-slate-500">最近更新</p><p className="mt-1 font-medium">{formatTenantDate(data.company.updatedAt)}</p></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>商业化概览</CardTitle>
                <CardDescription>套餐开通和使用量由企业负责人统一管理。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">当前有效套餐</p>
                  <p className="mt-1 font-semibold text-slate-950">{data.company.currentPlan?.name ?? "暂未开通套餐"}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{data.company.currentPlan?.description ?? "联系企业授权方开通套餐后，功能权限才会生效。"}</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Link href={`/team-os/subscription?companyId=${encodeURIComponent(data.context.companyId)}`} className="focus-ring inline-flex h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800">查看套餐</Link>
                  {data.context.permissions.canViewUsage ? <Link href={`/team-os/usage?companyId=${encodeURIComponent(data.context.companyId)}`} className="focus-ring inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50">查看使用量</Link> : null}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
