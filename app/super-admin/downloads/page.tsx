import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DownloadUpdateCenter } from "@/components/super-admin/DownloadUpdateCenter";

export default function SuperAdminDownloadsPage() {
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
          <p className="text-sm font-semibold text-teal-700">Release Center</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
            APK / EXE / Web 下载与更新中心
          </h2>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
            统一展示用户端、投喂管理员端、超级管理员端的 Web、Android APK、Windows EXE 发布状态。本阶段仅做 UI 和 mock 数据，不改任何打包脚本。
          </p>
        </div>
      </section>

      <DownloadUpdateCenter />
    </div>
  );
}
