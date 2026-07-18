import type { ReactNode } from "react";
import { Building2, ShieldCheck, Sparkles, UsersRound } from "lucide-react";

export function OnboardingShell({
  eyebrow,
  title,
  description,
  children
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-screen bg-slate-50 lg:grid-cols-[minmax(0,1.08fr)_minmax(440px,0.92fr)]">
      <section className="relative hidden overflow-hidden bg-slate-950 px-10 py-10 text-white lg:flex lg:flex-col xl:px-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.38),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.2),transparent_38%)]" />
        <div className="relative z-10 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-500 shadow-lg shadow-indigo-950/40">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-base font-semibold">AI Team OS</p>
            <p className="text-xs text-slate-300">AI 团队智能运营系统</p>
          </div>
        </div>

        <div className="relative z-10 mt-auto max-w-2xl pb-8">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm text-indigo-100 ring-1 ring-white/15">
            <Building2 className="h-4 w-4" aria-hidden="true" />
            企业授权与成员协作
          </div>
          <h1 className="text-5xl font-semibold leading-tight">一个企业授权，连接整支团队</h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
            企业负责人使用 XT-TEAM 授权码开通企业，主管、培训师和员工通过安全邀请加入，无需重复购买个人卡密。
          </p>
          <div className="mt-10 grid max-w-xl grid-cols-2 gap-3 text-sm text-slate-200">
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
              <UsersRound className="h-4 w-4 text-indigo-300" aria-hidden="true" />
              企业统一开通
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
              <ShieldCheck className="h-4 w-4 text-indigo-300" aria-hidden="true" />
              角色权限隔离
            </div>
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-8">
          <div className="mb-8 lg:hidden">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-200">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </span>
            <h1 className="mt-4 text-2xl font-semibold text-slate-950">AI Team OS</h1>
            <p className="mt-1 text-sm text-slate-500">AI 团队智能运营系统</p>
          </div>
          <p className="text-sm font-medium text-indigo-700">{eyebrow}</p>
          <h2 className="mt-2 text-3xl font-semibold text-slate-950">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
          {children}
        </div>
      </section>
    </main>
  );
}
