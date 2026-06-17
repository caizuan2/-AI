import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SyncDashboard } from "@/components/super-admin/sync/SyncDashboard";

export default function SuperAdminSyncPage() {
  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <Link
          href="/super-admin"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"
        >
          <ArrowLeft className="h-4 w-4" />
          返回超级管理员看板
        </Link>
        <div className="mt-5">
          <p className="text-sm font-semibold text-teal-700">Cross-platform Sync</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
            三端同步控制中心
          </h2>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
            Web、Android APK、Windows EXE 使用同一个账号体系、同一套后端和同一套数据源，展示跨端同步状态、异常、延迟和一致性。
          </p>
        </div>
      </section>

      <SyncDashboard />
    </div>
  );
}
