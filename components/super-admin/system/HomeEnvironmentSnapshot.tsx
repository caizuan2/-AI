"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { ErrorState, LoadingState, UnauthorizedState } from "@/components/super-admin/common/ApiState";
import { fetchDataSourceStatus, type SuperAdminSystemClientResult } from "@/lib/super-admin/system-client";
import type { DataSourceHealth } from "@/types/super-admin-system";

function statusLabel(value: boolean) {
  return value ? "已配置" : "未配置";
}

export function HomeEnvironmentSnapshot() {
  const [result, setResult] = useState<SuperAdminSystemClientResult<DataSourceHealth> | null>(null);

  useEffect(() => {
    let mounted = true;

    fetchDataSourceStatus().then((nextResult) => {
      if (mounted) {
        setResult(nextResult);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  if (!result) {
    return <LoadingState title="正在加载三端数据源与环境状态" />;
  }

  if (result.unauthorized) {
    return <UnauthorizedState />;
  }

  if (!result.ok || !result.data) {
    return <ErrorState message={result.error} />;
  }

  const health = result.data;
  const metrics = [
    ["数据库连接状态", statusLabel(health.databaseUrlConfigured && health.directUrlConfigured)],
    ["三端统一后端", health.sharedBackendRequired ? "必须共用" : "未要求"],
    ["Web / APK / EXE 同步", health.persistenceStatus],
    ["登录注册依赖", health.loginRegisterDependsOnDatabase ? "依赖数据库" : "未配置"],
    ["卡密授权依赖", health.licenseDependsOnDatabase ? "依赖数据库" : "未配置"],
    ["自测建议", "单窗口"]
  ];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-sm font-semibold text-teal-700">Environment & Data Source</p>
          <h2 className="mt-2 text-xl font-semibold tracking-normal text-slate-950">三端数据源与环境状态</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            DATABASE_URL / DIRECT_URL 缺失会导致登录、注册、三端同步、卡密激活和数据保存失败。页面只显示配置状态，不显示真实密钥。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            ["/super-admin/env-check", "环境连通性检查"],
            ["/super-admin/system-health", "系统健康状态"],
            ["/super-admin/sync", "三端同步控制中心"]
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50"
            >
              {label}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {metrics.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="truncate text-xs text-slate-500">{label}</p>
            <p className="mt-2 text-base font-semibold tracking-normal text-slate-950">{value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
