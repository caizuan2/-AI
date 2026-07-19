"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Building2, Factory, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unwrapApiResponse } from "@/lib/api/client";
import type { ActivateTeamOsCompanyResult } from "@/apps/team-os/features/onboarding/types";
import { FormMessage } from "@/apps/team-os/features/onboarding/components/FormMessage";

export function TeamOsActivateForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const accessReason = searchParams.get("reason");
  const renewalRequired = [
    "TENANT_COMPANY_EXPIRED",
    "SUBSCRIPTION_REQUIRED",
    "SUBSCRIPTION_INACTIVE",
    "SUBSCRIPTION_EXPIRED"
  ].includes(accessReason ?? "");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/team-os/auth/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, industry, code })
      });
      const data = await unwrapApiResponse<ActivateTeamOsCompanyResult>(response, "企业激活失败，请稍后重试。");
      router.replace(data.nextPath);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "网络错误，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-slate-800">企业名称</span>
        <span className="mt-2 flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100">
          <Building2 className="h-4 w-4 text-slate-400" aria-hidden="true" />
          <Input value={companyName} onChange={(event) => setCompanyName(event.target.value)} autoComplete="organization" autoFocus className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0" placeholder="请输入企业名称" />
        </span>
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-800">所属行业（选填）</span>
        <span className="mt-2 flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100">
          <Factory className="h-4 w-4 text-slate-400" aria-hidden="true" />
          <Input value={industry} onChange={(event) => setIndustry(event.target.value)} className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0" placeholder="例如：教育培训、企业服务" />
        </span>
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-800">XT-TEAM 企业授权码</span>
        <span className="mt-2 flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100">
          <KeyRound className="h-4 w-4 text-slate-400" aria-hidden="true" />
          <Input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} autoComplete="off" spellCheck={false} className="h-auto border-0 bg-transparent p-0 font-mono uppercase tracking-wide shadow-none focus-visible:ring-0" placeholder="XT-TEAM-XXXX-XXXX-XXXX-XXXX" />
        </span>
      </label>
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
        授权码只用于企业负责人首次开通。主管、培训师和员工应通过企业邀请加入，不需要单独输入卡密。
      </p>
      {renewalRequired ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-800">
          当前企业套餐已到期或未生效。XT-TEAM 开通码不能重复创建企业，请联系平台管理员续费或恢复现有套餐。
        </div>
      ) : null}
      {error ? <FormMessage message={error} /> : null}
      <Button type="submit" disabled={loading || renewalRequired} className="h-11 w-full bg-indigo-600 text-white hover:bg-indigo-700">
        {renewalRequired ? "请联系平台管理员续费" : loading ? "正在安全激活" : "激活企业并创建团队"}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Button>
      <div className="space-y-2 text-center text-sm text-slate-500">
        <p>已有账号？ <Link href="/team-os/login?next=%2Fteam-os%2Factivate" className="font-medium text-indigo-700 hover:text-indigo-800">登录后继续激活</Link></p>
        <p>没有账号？ <Link href="/team-os/register" className="font-medium text-indigo-700 hover:text-indigo-800">注册企业负责人账号</Link></p>
        <p>已有企业邀请？请打开负责人发送给你的专属邀请链接。</p>
      </div>
    </form>
  );
}
