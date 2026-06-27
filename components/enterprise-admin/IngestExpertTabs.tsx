"use client";

import { BookOpen, Check, Crown, Flame, HeartPulse, Megaphone, Plus, Sparkles, ThumbsUp, UserRound } from "lucide-react";
import type { IngestExpert, IngestExpertZone, IngestExpertZoneId } from "@/lib/enterprise/mock-experts";

const avatarToneClasses: Record<IngestExpert["tone"], string> = {
  green: "from-[#ddf8e6] via-white to-[#b8efd0] text-[#128246]",
  blue: "from-[#dfeaff] via-white to-[#bed4ff] text-[#2d5fa8]",
  amber: "from-[#fff0c4] via-white to-[#ffd67a] text-[#9a6500]",
  rose: "from-[#ffe0e5] via-white to-[#ffc0c9] text-[#b93b4a]",
  slate: "from-[#e9edf3] via-white to-[#cdd5df] text-[#475569]"
};

const zoneDecorations = {
  market: {
    Icon: ThumbsUp,
    iconClassName: "bg-[#fff4cf] text-[#d28700]",
    dotClassName: "bg-[#ff8a65]",
    glowClassName: "bg-[#f9d35f]/60"
  },
  news: {
    Icon: Flame,
    iconClassName: "bg-[#fff0e6] text-[#ef6c00]",
    dotClassName: "bg-[#7cdd97]",
    glowClassName: "bg-[#ffb36b]/55"
  },
  leader: {
    Icon: Crown,
    iconClassName: "bg-[#f0ecff] text-[#7758d1]",
    dotClassName: "bg-[#66c7ff]",
    glowClassName: "bg-[#b9a7ff]/55"
  }
} satisfies Record<IngestExpertZoneId, {
  Icon: typeof Sparkles;
  iconClassName: string;
  dotClassName: string;
  glowClassName: string;
}>;

function getRankMedal(index: number) {
  if (index === 0) {
    return { icon: "🥇", label: "冠军" };
  }

  if (index === 1) {
    return { icon: "🥈", label: "亚军" };
  }

  return { icon: "🥉", label: "季军" };
}

function getExpertAvatarIcon(expert: IngestExpert): typeof UserRound {
  const text = [
    expert.name,
    expert.category,
    expert.subcategory,
    expert.tags.join(" ")
  ].join(" ");

  if (/健康|瘦|KKS|控体|百问/.test(text)) {
    return HeartPulse;
  }

  if (/市场|营销|招商|事业|成交|素材/.test(text)) {
    return Megaphone;
  }

  if (/资料|文档|PPT|问答|课程|训练营/.test(text)) {
    return BookOpen;
  }

  if (/领袖|团队|复制|培养|管理/.test(text)) {
    return Crown;
  }

  return UserRound;
}

export function IngestExpertTabs({
  zones,
  experts,
  addedExpertIds,
  activeZone,
  onZoneChange,
  onAddExpert
}: {
  zones: IngestExpertZone[];
  experts: IngestExpert[];
  addedExpertIds: string[];
  activeZone: IngestExpertZoneId | "all";
  onZoneChange: (zoneId: IngestExpertZoneId | "all") => void;
  onAddExpert: (expert: IngestExpert) => void;
}) {
  const addedSet = new Set(addedExpertIds);

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {zones.map((zone) => {
        const isActive = activeZone === zone.id;
        const decoration = zoneDecorations[zone.id];
        const DecorationIcon = decoration.Icon;
        const zoneExperts = experts
          .filter((expert) => expert.zoneId === zone.id)
          .sort((left, right) => {
            const leftIndex = zone.experts.indexOf(left.name);
            const rightIndex = zone.experts.indexOf(right.name);

            return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
          })
          .slice(0, 3);

        return (
          <article
            key={zone.id}
            className={[
              "group relative min-h-[278px] overflow-hidden rounded-[30px] border border-white/70 bg-white p-5 shadow-[0_16px_44px_rgba(15,23,42,0.075)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_56px_rgba(15,23,42,0.1)]",
              isActive ? "ring-2 ring-[#202020]/10" : "ring-1 ring-[#ffffff]/70"
            ].join(" ")}
          >
            <div className={["absolute inset-0 bg-gradient-to-br opacity-95", zone.accent].join(" ")} />
            <div className={["absolute -right-7 -top-8 h-28 w-28 rounded-full blur-2xl transition group-hover:scale-110", decoration.glowClassName].join(" ")} />
            <div className="pointer-events-none absolute right-5 top-5 flex items-center gap-2">
              <span className={["flex h-8 w-8 items-center justify-center rounded-full shadow-sm ring-2 ring-white/80", decoration.iconClassName].join(" ")}>
                <DecorationIcon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className={["mt-5 h-2.5 w-2.5 rounded-full shadow-sm", decoration.dotClassName].join(" ")} />
              <span className="mb-5 h-2 w-2 rounded-full bg-white/85 shadow-sm" />
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => onZoneChange(isActive ? "all" : zone.id)}
                className="flex w-full items-center justify-between gap-3 rounded-2xl pr-16 text-left"
              >
                <h2 className="text-[21px] font-semibold tracking-tight text-[#202020]">{zone.label}</h2>
              </button>
              <div className="mt-5 space-y-3">
                {zoneExperts.length > 0 ? zoneExperts.map((expert, index) => {
                  const isAdded = addedSet.has(expert.id);
                  const rank = getRankMedal(index);
                  const AvatarIcon = getExpertAvatarIcon(expert);

                  return (
                    <div key={expert.id} title={expert.description} className="flex min-h-[58px] items-center gap-3 rounded-[23px] bg-white/78 px-3 py-2.5 shadow-sm ring-1 ring-white/75 backdrop-blur">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center text-[24px] leading-none" role="img" aria-label={rank.label}>{rank.icon}</span>
                      <span className={["flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br shadow-sm ring-2 ring-white/90", avatarToneClasses[expert.tone]].join(" ")}>
                        <AvatarIcon className="h-[18px] w-[18px]" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[#202020]">{expert.name}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onAddExpert(expert)}
                        disabled={isAdded}
                        className={[
                          "flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-semibold shadow-sm transition",
                          isAdded
                            ? "bg-[#e8f7ee] text-[#128246]"
                            : "bg-[#202020] text-white hover:bg-black"
                        ].join(" ")}
                      >
                        {isAdded ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Plus className="h-3.5 w-3.5" aria-hidden="true" />}
                        {isAdded ? "已添加" : "添加"}
                      </button>
                    </div>
                  );
                }) : (
                  <div className="rounded-[20px] bg-white/75 px-4 py-6 text-center text-sm font-semibold text-[#858580] shadow-sm">
                    暂无匹配专家
                  </div>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
