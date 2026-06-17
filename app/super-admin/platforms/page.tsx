import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PlatformsDashboard } from "@/components/super-admin/platforms/PlatformsDashboard";

export default function SuperAdminPlatformsPage() {
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
          <p className="text-sm font-semibold text-teal-700">Platform Releases</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
            三端版本与发布状态
          </h2>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
            展示超级管理员 Web、Android APK、Windows EXE 的版本、下载地址、同步能力和数据源状态。这里只展示，不打包、不发布。
          </p>
        </div>
      </section>

      <PlatformsDashboard />
    </div>
  );
}
