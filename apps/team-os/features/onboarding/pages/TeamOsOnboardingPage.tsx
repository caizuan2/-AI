import Link from "next/link";
import { ArrowRight, Building2, CheckCircle2, Settings2, UserRoundPlus } from "lucide-react";

export function TeamOsOnboardingPage() {
  const steps = [
    { icon: CheckCircle2, title: "企业身份已就绪", description: "企业授权、套餐和当前成员角色已经通过服务端校验。" },
    { icon: Settings2, title: "完善企业资料", description: "进入企业中心补充行业、品牌和团队说明。" },
    { icon: UserRoundPlus, title: "邀请团队成员", description: "负责人可以邀请主管、培训师和员工加入默认团队。" }
  ];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <section className="overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-600 to-slate-950 p-6 text-white shadow-lg shadow-indigo-100 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/10 ring-1 ring-white/20"><Building2 className="h-6 w-6" /></span>
          <div>
            <p className="text-sm font-medium text-indigo-100">企业初始化完成</p>
            <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">欢迎进入 AI Team OS</h1>
          </div>
        </div>
        <p className="mt-5 max-w-2xl text-sm leading-7 text-indigo-100 sm:text-base">你的企业访问权限已经建立。接下来可完善企业资料、邀请成员，或直接进入智能运营工作台。</p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {steps.map(({ icon: Icon, title, description }, index) => (
          <article key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><Icon className="h-5 w-5" /></span>
              <span className="text-xs font-semibold text-slate-400">0{index + 1}</span>
            </div>
            <h2 className="mt-4 font-semibold text-slate-950">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
          </article>
        ))}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-slate-950">开始配置你的企业工作台</h2>
          <p className="mt-1 text-sm text-slate-500">所有企业数据按 companyId 隔离，成员只能访问所属企业。</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/team-os/organization" className="focus-ring inline-flex h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50">组织与成员</Link>
          <Link href="/team-os" className="focus-ring inline-flex h-11 items-center justify-center rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-700">进入工作台 <ArrowRight className="ml-2 h-4 w-4" /></Link>
        </div>
      </section>
    </div>
  );
}
