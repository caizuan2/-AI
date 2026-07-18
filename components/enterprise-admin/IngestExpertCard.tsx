"use client";

import { Check, Plus, Star } from "lucide-react";
import type { IngestExpert } from "@/lib/enterprise/mock-experts";

const toneClasses: Record<IngestExpert["tone"], string> = {
  green: "from-[#dff8e8] to-[#f7fff9] text-[#128246]",
  blue: "from-[#e7f0ff] to-[#f8fbff] text-[#2d5fa8]",
  amber: "from-[#fff3d6] to-[#fffdf6] text-[#9a6500]",
  rose: "from-[#ffe8ea] to-[#fff8f9] text-[#b93b4a]",
  slate: "from-[#eceff3] to-[#fbfcfd] text-[#475569]"
};

export function IngestExpertCard({
  expert,
  isAdded,
  onAdd
}: {
  expert: IngestExpert;
  isAdded: boolean;
  onAdd: (expert: IngestExpert) => void;
}) {
  return (
    <article className="group relative overflow-hidden rounded-[24px] border border-[#ececea] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#dcdcd8] hover:shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
      <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-[#f3f9f5] opacity-0 blur-xl transition group-hover:opacity-100" />
      <div className="relative flex items-start gap-3">
        <span className={["flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-gradient-to-br text-sm font-bold shadow-sm", toneClasses[expert.tone]].join(" ")}>
          {expert.avatar}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-[#202020]">{expert.name}</h3>
              <p className="mt-0.5 text-[11px] font-semibold text-[#8b8b86]">{expert.zoneTitle} · {expert.category}</p>
            </div>
            {expert.badge ? (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#202020] text-[11px] font-semibold text-white">{expert.badge}</span>
            ) : null}
          </div>
          <p className="mt-3 line-clamp-3 min-h-[60px] text-xs leading-5 text-[#6c6c67]">{expert.description}</p>
        </div>
      </div>

      <div className="relative mt-4 flex flex-wrap gap-1.5">
        {expert.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="rounded-full bg-[#f5f5f3] px-2 py-1 text-[11px] font-semibold text-[#777]">{tag}</span>
        ))}
      </div>

      <div className="relative mt-4 flex items-center justify-between gap-3 border-t border-[#f1f1ef] pt-3 text-[11px] text-[#8a8a86]">
        <span className="truncate font-semibold text-[#555]">{expert.author}</span>
        <span className="flex items-center gap-1">
          <Star className="h-3.5 w-3.5 fill-[#f4c430] text-[#f4c430]" aria-hidden="true" />
          {expert.heat} · 用量 {expert.usage} · 收藏 {expert.favorites}
        </span>
      </div>

      <button
        type="button"
        onClick={() => onAdd(expert)}
        disabled={isAdded}
        className={[
          "absolute bottom-4 left-4 right-4 flex h-10 items-center justify-center gap-2 rounded-2xl text-sm font-semibold shadow-[0_16px_38px_rgba(15,23,42,0.16)] transition",
          isAdded
            ? "bg-[#e9f8ef] text-[#128246] opacity-100"
            : "translate-y-3 bg-[#202020] text-white opacity-0 hover:bg-black group-hover:translate-y-0 group-hover:opacity-100"
        ].join(" ")}
      >
        {isAdded ? <Check className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
        {isAdded ? "已添加" : "添加到 Agent"}
      </button>
    </article>
  );
}
