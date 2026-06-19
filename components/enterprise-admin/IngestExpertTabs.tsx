"use client";

import { Sparkles } from "lucide-react";
import type { IngestExpertZone, IngestExpertZoneId } from "@/lib/enterprise/mock-experts";

export function IngestExpertTabs({
  zones,
  activeZone,
  onZoneChange
}: {
  zones: IngestExpertZone[];
  activeZone: IngestExpertZoneId | "all";
  onZoneChange: (zoneId: IngestExpertZoneId | "all") => void;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {zones.map((zone) => {
        const isActive = activeZone === zone.id;

        return (
          <button
            key={zone.id}
            type="button"
            onClick={() => onZoneChange(isActive ? "all" : zone.id)}
            className={[
              "group relative overflow-hidden rounded-[26px] border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_16px_42px_rgba(15,23,42,0.08)]",
              isActive ? "border-[#202020] bg-white" : "border-[#e9e9e6] bg-white"
            ].join(" ")}
          >
            <div className={["absolute inset-0 bg-gradient-to-br opacity-90", zone.accent].join(" ")} />
            <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/55 blur-sm transition group-hover:scale-110" />
            <div className="relative">
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-full bg-white/85 px-2.5 py-1 text-[11px] font-semibold text-[#555] shadow-sm">{zone.label}</span>
                <span className={["flex h-8 w-8 items-center justify-center rounded-full", isActive ? "bg-[#202020] text-white" : "bg-white/80 text-[#128246]"].join(" ")}>
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
              <h2 className="mt-4 text-xl font-semibold tracking-tight text-[#202020]">{zone.title}</h2>
              <p className="mt-1 text-xs font-semibold text-[#8a8a86]">{zone.subtitle}</p>
              <div className="mt-4 space-y-2">
                {zone.experts.map((expert, index) => (
                  <div key={expert} className="flex items-center gap-2 rounded-2xl bg-white/75 px-3 py-2 text-sm font-semibold text-[#2b2b2b] shadow-sm">
                    <span className={["flex h-5 w-5 items-center justify-center rounded-full text-[11px] text-white", index === 0 ? "bg-[#202020]" : "bg-[#9da3ad]"].join(" ")}>{index + 1}</span>
                    <span className="truncate">{expert}</span>
                  </div>
                ))}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

