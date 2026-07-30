import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ExpertCatalogDashboard } from "@/components/super-admin/expert-catalog/ExpertCatalogDashboard";

export const dynamic = "force-dynamic";

export default function SuperAdminExpertCatalogPage() {
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
          <p className="text-sm font-semibold text-teal-700">Agent Catalog Control</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
            Agent 与专区管理
          </h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
            管理专家广场的展示名称、专区、上下架和排序。固定知识库绑定只读锁定，改名或移动专区不会改变 Agent 的检索边界。
          </p>
        </div>
      </section>

      <ExpertCatalogDashboard />
    </div>
  );
}
