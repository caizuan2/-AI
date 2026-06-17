import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DevicesDashboard } from "@/components/super-admin/devices/DevicesDashboard";

export default function SuperAdminDevicesPage() {
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
          <p className="text-sm font-semibold text-teal-700">Device Sessions</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
            设备会话管理
          </h2>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
            展示 Web、Android APK、Windows EXE 当前登录设备、会话状态、同步状态和风险等级。所有操作按钮仅为后续接入占位。
          </p>
        </div>
      </section>

      <DevicesDashboard />
    </div>
  );
}
