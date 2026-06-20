import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, ArrowRight } from "lucide-react";

type ModulePlaceholderProps = {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  status: string;
  capabilities: string[];
  boundaries: string[];
  nextHref?: string;
  nextLabel?: string;
};

export function ModulePlaceholder({
  eyebrow,
  title,
  description,
  icon: Icon,
  status,
  capabilities,
  boundaries,
  nextHref,
  nextLabel
}: ModulePlaceholderProps) {
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
        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-teal-700">{eyebrow}</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950 sm:text-3xl">
              {title}
            </h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">{description}</p>
          </div>
          <span className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-600">
            {status}
          </span>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.45fr)]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <span className="grid h-11 w-11 place-items-center rounded-lg bg-slate-100 text-slate-700">
            <Icon className="h-5 w-5" />
          </span>
          <h2 className="mt-4 text-lg font-semibold tracking-normal text-slate-950">模块能力范围</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {capabilities.map((item) => (
              <div key={item} className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                {item}
              </div>
            ))}
          </div>
        </div>

        <aside className="rounded-lg border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <h2 className="text-lg font-semibold tracking-normal text-amber-950">保护边界</h2>
          <div className="mt-4 space-y-3">
            {boundaries.map((item) => (
              <p key={item} className="rounded-lg border border-amber-200 bg-white/70 p-3 text-sm leading-6 text-amber-900">
                {item}
              </p>
            ))}
          </div>
          {nextHref && nextLabel ? (
            <Link
              href={nextHref}
              className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800"
            >
              {nextLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : null}
        </aside>
      </section>
    </div>
  );
}
